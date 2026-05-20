// Tool executor for the agent loop. Every public path:
//   1. Validates inputs (clamping, scope normalization).
//   2. Captures pre-state for the inverse where applicable.
//   3. Mutates DB via the per-request user-scoped Supabase client.
//   4. Records the inverse in agent_journal (recordEntry).
// Returns { ok, payload, journal_entry: { id, label, tool_name, inverse_summary } }.
//
// Errors are surfaced as { ok:false, error } payloads — callers (REST harness,
// future WS layer) forward to the model as functionResponse so it can react.

const { randomUUID } = require('crypto');
const { expandRepeatDates, findOverlaps } = require('./repeat');
const { recordEntry, popLatest, markUndone } = require('./journal');
const { inferCategory, CATEGORY_IDS } = require('./categorize');

// Server-side category resolution: prefer the agent's value when it picked a
// valid enum; otherwise fall back to deterministic keyword inference. Used by
// both create and update paths so the LLM can be confident or omit.
function resolveCategory(supplied, title) {
  if (typeof supplied === 'string' && CATEGORY_IDS.includes(supplied)) {
    return supplied;
  }
  return inferCategory(title);
}

const VALID_RULES = new Set(['none', 'daily', 'weekdays', 'weekly']);
const VALID_SCOPES = new Set(['instance', 'this_and_future', 'series']);
const VALID_MEALS = new Set(['breakfast', 'lunch', 'dinner']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const DEFAULT_TIME = 540;
const DEFAULT_DURATION = 30;

function clampTime(t) {
  if (typeof t !== 'number' || !Number.isFinite(t)) return DEFAULT_TIME;
  return Math.max(0, Math.min(1439, Math.round(t)));
}
function clampDuration(d) {
  if (typeof d !== 'number' || !Number.isFinite(d)) return DEFAULT_DURATION;
  return Math.max(5, Math.round(d));
}
function pickRule(r) {
  return VALID_RULES.has(r) ? r : 'none';
}
function pickScope(s) {
  return VALID_SCOPES.has(s) ? s : 'instance';
}
function isYYYYMMDD(s) {
  return typeof s === 'string' && DATE_RE.test(s);
}
function fmtTime(min) {
  if (typeof min !== 'number' || !Number.isFinite(min)) return '';
  const m = ((min % 1440) + 1440) % 1440;
  let h = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return mm === 0 ? `${h}${ampm.toLowerCase()}` : `${h}:${String(mm).padStart(2, '0')}${ampm.toLowerCase()}`;
}

// Short human description for the undo chip. Pulls the title from the args
// or, when missing (e.g. update by id only), from the resulting payload.
function labelFor(call, payload = {}) {
  const args = call.args || {};
  switch (call.name) {
    case 'create_task': {
      const title = args.title || payload.title || 'task';
      const t = payload.time_minutes ?? args.time_minutes;
      return t != null ? `Created ${title} ${fmtTime(t)}` : `Created ${title}`;
    }
    case 'update_task': {
      const fields = args.fields || {};
      const title = payload.title || fields.title || 'task';
      const scopeTag =
        args.scope === 'series' ? ' series' : args.scope === 'this_and_future' ? ' (and future)' : '';
      if (fields.time_minutes != null) return `Moved ${title} to ${fmtTime(fields.time_minutes)}`;
      if (fields.date) return `Moved ${title} to ${fields.date}`;
      if (typeof fields.done === 'boolean')
        return `${fields.done ? 'Completed' : 'Reopened'} ${title}`;
      if (fields.repeat_rule) return `Updated ${title}${scopeTag} repeat ${fields.repeat_rule}`;
      if (fields.title) return `Renamed task to ${fields.title}`;
      return `Updated ${title}${scopeTag}`;
    }
    case 'delete_task': {
      const title = payload.title || 'task';
      const scopeTag =
        args.scope === 'series' ? ' series' : args.scope === 'this_and_future' ? ' (and future)' : '';
      return `Deleted ${title}${scopeTag}`;
    }
    case 'update_meal_default': {
      const meal = args.meal ? args.meal[0].toUpperCase() + args.meal.slice(1) : 'Meal';
      return `${meal} default → ${fmtTime(args.time_minutes)}`;
    }
    case 'upsert_constraint':
      return `Saved preference: ${(args.text || '').trim()}`.slice(0, 80);
    case 'undo_last':
      return `Undid ${args.n ?? 1} change${(args.n ?? 1) === 1 ? '' : 's'}`;
    case 'done':
      return args.summary || 'Done';
    default:
      return call.name;
  }
}

function inverseSummary(inverse) {
  if (!inverse || typeof inverse !== 'object') return '';
  return inverse.type || '';
}

// ---------------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------------

async function execCreateTask(session, call) {
  const { supa, userId } = session;
  const args = call.args || {};
  if (!args.title || !isYYYYMMDD(args.date)) {
    return { ok: false, error: 'create_task requires title and YYYY-MM-DD date' };
  }

  const rule = pickRule(args.repeat_rule);
  const duration = clampDuration(args.duration_minutes);
  const desired = clampTime(args.time_minutes);

  // Pull a ±3d task window for conflict resolution. Same shape as the
  // /plan-day-audio path uses.
  const windowStart = addDays(args.date, -3);
  const windowEnd = addDays(args.date, 3);
  const { data: nearby } = await supa
    .from('tasks')
    .select('id, date, time_minutes, duration_minutes')
    .eq('user_id', userId)
    .gte('date', windowStart)
    .lte('date', windowEnd);

  // Place the task at the time the user requested. If existing tasks overlap,
  // we surface them in the payload instead of silently sliding — the user
  // (via the agent's summary) decides whether to keep, move, or delete the
  // conflicting task.
  const overlaps = findOverlaps(desired, duration, args.date, nearby ?? []);

  const baseRow = {
    user_id: userId,
    title: String(args.title).slice(0, 200),
    time_minutes: desired,
    duration_minutes: duration,
    repeat_rule: rule,
    done: false,
    category: resolveCategory(args.category, args.title),
  };

  let inverse;
  let payload;

  if (rule === 'none') {
    const row = { ...baseRow, date: args.date };
    const { data: ins, error } = await supa
      .from('tasks')
      .insert(row)
      .select('id, title, date, time_minutes, duration_minutes, repeat_rule, category')
      .maybeSingle();
    if (error || !ins) {
      return { ok: false, error: `insert failed: ${error?.message || 'no row'}` };
    }
    inverse = { type: 'delete_task_id', id: ins.id };
    payload = {
      task_id: ins.id,
      title: ins.title,
      date: ins.date,
      time_minutes: ins.time_minutes,
      duration_minutes: ins.duration_minutes,
      category: ins.category,
      overlaps_with: overlaps.map((t) => ({
        id: t.id,
        time_minutes: t.time_minutes,
        duration_minutes: t.duration_minutes,
      })),
    };
  } else {
    const seriesId = randomUUID();
    const dates = expandRepeatDates(args.date, rule);
    const rows = dates.map((d) => ({ ...baseRow, date: d, series_id: seriesId }));
    // Insert row-by-row so a mid-series failure can be rolled back before the
    // journal entry is written. A single batch insert in Postgres is atomic,
    // but a per-row loop lets us surface partial-failure cleanup without
    // depending on transaction semantics from the supabase-js client.
    const inserted = [];
    let insertErr = null;
    for (const row of rows) {
      const { data: one, error } = await supa
        .from('tasks')
        .insert(row)
        .select('id, title, date, time_minutes, duration_minutes, repeat_rule, series_id, category')
        .maybeSingle();
      if (error || !one) {
        insertErr = error || new Error('no row returned');
        break;
      }
      inserted.push(one);
    }
    if (insertErr || !inserted.length) {
      // Best-effort cleanup so we don't leave orphan rows the user can't undo
      // via the agent (no journal entry will be written for a failed insert).
      if (inserted.length) {
        const cleanupIds = inserted.map((r) => r.id);
        const { error: cleanupErr } = await supa
          .from('tasks')
          .delete()
          .eq('user_id', userId)
          .in('id', cleanupIds);
        if (cleanupErr) {
          // Log and proceed to throw the original error; the cleanup failure
          // is informational, not the user-facing cause.
          console.error('series insert cleanup failed:', cleanupErr.message, 'orphan ids:', cleanupIds);
        }
      }
      return { ok: false, error: `insert series failed: ${insertErr?.message || 'no rows'}` };
    }
    inverse = { type: 'delete_series_id', series_id: seriesId };
    payload = {
      series_id: seriesId,
      title: inserted[0].title,
      time_minutes: inserted[0].time_minutes,
      duration_minutes: inserted[0].duration_minutes,
      repeat_rule: rule,
      category: inserted[0].category,
      created_count: inserted.length,
      overlaps_with: overlaps.map((t) => ({
        id: t.id,
        time_minutes: t.time_minutes,
        duration_minutes: t.duration_minutes,
      })),
    };
  }

  return { ok: true, payload, inverse };
}

// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------

async function execUpdateTask(session, call) {
  const { supa, userId } = session;
  const args = call.args || {};
  if (!args.task_id || !args.fields || typeof args.fields !== 'object') {
    return { ok: false, error: 'update_task requires task_id and fields' };
  }
  const scope = pickScope(args.scope);
  const fields = args.fields;

  // Load the target row first; we need its series_id and current values.
  const { data: target, error: tErr } = await supa
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('id', args.task_id)
    .maybeSingle();
  if (tErr || !target) {
    return { ok: false, error: `task ${args.task_id} not found` };
  }

  // -------- replace_set: changing repeat_rule rebuilds the in-scope rows --
  if (
    fields.repeat_rule !== undefined &&
    VALID_RULES.has(fields.repeat_rule) &&
    fields.repeat_rule !== target.repeat_rule
  ) {
    const newRule = fields.repeat_rule;
    const newTitle = fields.title !== undefined ? String(fields.title).slice(0, 200) : target.title;
    const newTime = clampTime(
      fields.time_minutes !== undefined ? fields.time_minutes : target.time_minutes,
    );
    const newDur = clampDuration(
      fields.duration_minutes !== undefined ? fields.duration_minutes : target.duration_minutes,
    );
    const newStart = isYYYYMMDD(fields.date) ? fields.date : target.date;

    // Capture the deleted set before we drop it (full rows).
    let delSelect = supa
      .from('tasks')
      .select('*')
      .eq('user_id', userId);
    if (scope === 'series' && target.series_id) {
      delSelect = delSelect.eq('series_id', target.series_id);
    } else if (scope === 'this_and_future' && target.series_id) {
      delSelect = delSelect.eq('series_id', target.series_id).gte('date', target.date);
    } else {
      delSelect = delSelect.eq('id', target.id);
    }
    const { data: deleted, error: selErr } = await delSelect;
    if (selErr) return { ok: false, error: `replace_set capture failed: ${selErr.message}` };

    let delQ = supa.from('tasks').delete().eq('user_id', userId);
    if (scope === 'series' && target.series_id) {
      delQ = delQ.eq('series_id', target.series_id);
    } else if (scope === 'this_and_future' && target.series_id) {
      delQ = delQ.eq('series_id', target.series_id).gte('date', target.date);
    } else {
      delQ = delQ.eq('id', target.id);
    }
    const { error: delErr } = await delQ;
    if (delErr) return { ok: false, error: `replace_set delete failed: ${delErr.message}` };

    const baseRow = {
      user_id: userId,
      title: newTitle,
      time_minutes: newTime,
      duration_minutes: newDur,
      repeat_rule: newRule,
      done: false,
      category: resolveCategory(fields.category, newTitle),
    };

    let insertedIds = [];
    let payload;
    if (newRule === 'none') {
      const row = { ...baseRow, date: newStart };
      const { data: ins, error } = await supa
        .from('tasks')
        .insert(row)
        .select('id, title, date, time_minutes, duration_minutes, repeat_rule, category')
        .maybeSingle();
      if (error || !ins) return { ok: false, error: `replace_set insert failed: ${error?.message}` };
      insertedIds = [ins.id];
      payload = {
        task_id: ins.id,
        title: ins.title,
        date: ins.date,
        time_minutes: ins.time_minutes,
        duration_minutes: ins.duration_minutes,
        repeat_rule: ins.repeat_rule,
        category: ins.category,
        replaced_count: deleted?.length ?? 0,
      };
    } else {
      const seriesId = randomUUID();
      const dates = expandRepeatDates(newStart, newRule);
      const rows = dates.map((d) => ({ ...baseRow, date: d, series_id: seriesId }));
      const { data: ins, error } = await supa
        .from('tasks')
        .insert(rows)
        .select('id, title, date, time_minutes, duration_minutes, repeat_rule, series_id, category');
      if (error || !ins?.length)
        return { ok: false, error: `replace_set series insert failed: ${error?.message}` };
      insertedIds = ins.map((r) => r.id);
      payload = {
        series_id: seriesId,
        title: ins[0].title,
        time_minutes: ins[0].time_minutes,
        duration_minutes: ins[0].duration_minutes,
        repeat_rule: newRule,
        category: ins[0].category,
        replaced_count: deleted?.length ?? 0,
        created_count: ins.length,
      };
    }

    const inverse = {
      type: 'replace_set',
      deleted: deleted ?? [],
      inserted_ids: insertedIds,
    };
    return { ok: true, payload, inverse };
  }

  // -------- normal patch path -------------------------------------------
  const patch = {};
  if (fields.title !== undefined) patch.title = String(fields.title).slice(0, 200);
  if (fields.time_minutes !== undefined) patch.time_minutes = clampTime(fields.time_minutes);
  if (fields.duration_minutes !== undefined) patch.duration_minutes = clampDuration(fields.duration_minutes);
  if (typeof fields.done === 'boolean') patch.done = fields.done;
  // date only meaningful for instance scope; setting all rows in a series to
  // the same date is virtually never the user's intent.
  if (scope === 'instance' && isYYYYMMDD(fields.date)) patch.date = fields.date;
  // Category: respect agent-supplied value, or recompute from new title.
  // If neither changes, leave the existing row category alone.
  if (typeof fields.category === 'string' && CATEGORY_IDS.includes(fields.category)) {
    patch.category = fields.category;
  } else if (patch.title !== undefined) {
    patch.category = inferCategory(patch.title);
  }

  if (!Object.keys(patch).length) {
    return { ok: false, error: 'no recognized fields to update' };
  }

  // Detect overlaps on instance moves but do NOT auto-slide. The user's
  // requested time is honored; the model surfaces any overlap to the user.
  let updateOverlaps = [];
  if (
    scope === 'instance' &&
    (patch.time_minutes !== undefined || patch.date !== undefined)
  ) {
    const newDate = patch.date ?? target.date;
    const newTime = patch.time_minutes ?? target.time_minutes;
    const newDur = patch.duration_minutes ?? target.duration_minutes;
    const { data: nearby } = await supa
      .from('tasks')
      .select('id, date, time_minutes, duration_minutes')
      .eq('user_id', userId)
      .gte('date', addDays(newDate, -3))
      .lte('date', addDays(newDate, 3));
    updateOverlaps = findOverlaps(newTime, newDur, newDate, nearby ?? [], target.id);
  }

  // Capture pre-rows scoped to the same query as the update for restore.
  // Series-scope branches need every affected row; instance-scope needs the
  // full target row so applyInverse('restore_row') can upsert it back without
  // dropping fields the patch didn't touch.
  let before;
  if (scope === 'series' && target.series_id) {
    const { data, error: capErr } = await supa
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('series_id', target.series_id);
    if (capErr) return { ok: false, error: `capture before failed: ${capErr.message}` };
    before = data ?? [];
  } else if (scope === 'this_and_future' && target.series_id) {
    const { data, error: capErr } = await supa
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('series_id', target.series_id)
      .gte('date', target.date);
    if (capErr) return { ok: false, error: `capture before failed: ${capErr.message}` };
    before = data ?? [];
  } else {
    // Instance scope: re-select the full row right before the update so the
    // inverse carries every column (not just whatever `target` was loaded with
    // earlier in this function).
    const { data, error: capErr } = await supa
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('id', target.id)
      .maybeSingle();
    if (capErr) return { ok: false, error: `capture before failed: ${capErr.message}` };
    before = data ? [data] : [];
  }

  let updQ = supa.from('tasks').update(patch).eq('user_id', userId);
  if (scope === 'series' && target.series_id) {
    updQ = updQ.eq('series_id', target.series_id);
  } else if (scope === 'this_and_future' && target.series_id) {
    updQ = updQ.eq('series_id', target.series_id).gte('date', target.date);
  } else {
    updQ = updQ.eq('id', target.id);
  }
  const { data: updRows, error: updErr } = await updQ.select('id, title, date, time_minutes, duration_minutes, category');
  if (updErr) return { ok: false, error: `update failed: ${updErr.message}` };

  const inverse =
    (before ?? []).length > 1
      ? { type: 'restore_rows', before: before ?? [] }
      : {
          type: 'restore_row',
          id: target.id,
          before: (before ?? [])[0] ?? target,
          before_updated_at: target.updated_at,
        };

  const payload = {
    task_id: target.id,
    title: updRows?.[0]?.title ?? target.title,
    updated_count: updRows?.length ?? 0,
    fields: patch,
    overlaps_with: updateOverlaps.map((t) => ({
      id: t.id,
      time_minutes: t.time_minutes,
      duration_minutes: t.duration_minutes,
    })),
  };
  return { ok: true, payload, inverse };
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

async function execDeleteTask(session, call) {
  const { supa, userId } = session;
  const args = call.args || {};
  if (!args.task_id) return { ok: false, error: 'delete_task requires task_id' };
  const scope = pickScope(args.scope);

  const { data: target, error: tErr } = await supa
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('id', args.task_id)
    .maybeSingle();
  if (tErr || !target) return { ok: false, error: `task ${args.task_id} not found` };

  let scopeSel = supa.from('tasks').select('*').eq('user_id', userId);
  if (scope === 'series' && target.series_id) {
    scopeSel = scopeSel.eq('series_id', target.series_id);
  } else if (scope === 'this_and_future' && target.series_id) {
    scopeSel = scopeSel.eq('series_id', target.series_id).gte('date', target.date);
  } else {
    scopeSel = scopeSel.eq('id', target.id);
  }
  // Bound the journal payload size; v1 cap = ~one semester of weekly rows.
  scopeSel = scopeSel.limit(60);
  const { data: rows, error: capErr } = await scopeSel;
  if (capErr) return { ok: false, error: `capture before delete failed: ${capErr.message}` };

  let delQ = supa.from('tasks').delete().eq('user_id', userId);
  if (scope === 'series' && target.series_id) {
    delQ = delQ.eq('series_id', target.series_id);
  } else if (scope === 'this_and_future' && target.series_id) {
    delQ = delQ.eq('series_id', target.series_id).gte('date', target.date);
  } else {
    delQ = delQ.eq('id', target.id);
  }
  const { data: delRows, error: delErr } = await delQ.select('id');
  if (delErr) return { ok: false, error: `delete failed: ${delErr.message}` };

  const inverse = { type: 'insert_rows', rows: rows ?? [] };
  const payload = {
    task_id: target.id,
    title: target.title,
    deleted_count: delRows?.length ?? 0,
    scope,
  };
  return { ok: true, payload, inverse };
}

// ---------------------------------------------------------------------------
// MEAL DEFAULT
// ---------------------------------------------------------------------------

async function execUpdateMealDefault(session, call) {
  const { supa, userId } = session;
  const args = call.args || {};
  if (!VALID_MEALS.has(args.meal)) {
    return { ok: false, error: 'meal must be breakfast|lunch|dinner' };
  }
  const t = clampTime(args.time_minutes);
  const field = `${args.meal}_time_minutes`;

  const { data: cur, error: selErr } = await supa
    .from('profiles')
    .select(field)
    .eq('id', userId)
    .maybeSingle();
  if (selErr) return { ok: false, error: `read profile failed: ${selErr.message}` };
  const before = cur?.[field] ?? null;

  const { error: updErr } = await supa
    .from('profiles')
    .update({ [field]: t })
    .eq('id', userId);
  if (updErr) return { ok: false, error: `profile update failed: ${updErr.message}` };

  const inverse = { type: 'restore_profile_field', field, before };
  const payload = { meal: args.meal, time_minutes: t, previous: before };
  return { ok: true, payload, inverse };
}

// ---------------------------------------------------------------------------
// CONSTRAINT
// ---------------------------------------------------------------------------

async function execUpsertConstraint(session, call) {
  const { supa } = session;
  const args = call.args || {};
  if (!args.text || !args.category || !args.strength) {
    return { ok: false, error: 'upsert_constraint requires text, category, strength' };
  }
  const { data, error } = await supa.rpc('upsert_constraint', {
    p_text: String(args.text).trim().toLowerCase(),
    p_category: args.category,
    p_strength: args.strength,
  });
  if (error) return { ok: false, error: `upsert_constraint failed: ${error.message}` };
  // The RPC returns the upserted constraint's UUID (scalar or single-row).
  // Surface it in the payload so the model can reference it on later turns
  // (e.g. for reinforced_constraint_ids).
  let constraintId = null;
  if (typeof data === 'string') {
    constraintId = data;
  } else if (Array.isArray(data) && data.length) {
    const first = data[0];
    constraintId = (first && (first.id || first.constraint_id || first.upsert_constraint)) || null;
  } else if (data && typeof data === 'object') {
    constraintId = data.id || data.constraint_id || data.upsert_constraint || null;
  }
  return {
    ok: true,
    payload: {
      constraint_id: constraintId,
      text: args.text,
      category: args.category,
      strength: args.strength,
    },
    inverse: { type: 'noop' },
  };
}

// ---------------------------------------------------------------------------
// UNDO
// ---------------------------------------------------------------------------

async function applyInverse(session, inverse) {
  const { supa, userId } = session;
  if (!inverse || !inverse.type) return { ok: false, reason: 'missing inverse' };

  switch (inverse.type) {
    case 'noop':
      return { ok: true };

    case 'delete_task_id': {
      const { error } = await supa
        .from('tasks')
        .delete()
        .eq('user_id', userId)
        .eq('id', inverse.id);
      if (error) return { ok: false, reason: error.message };
      return { ok: true };
    }

    case 'delete_series_id': {
      const { error } = await supa
        .from('tasks')
        .delete()
        .eq('user_id', userId)
        .eq('series_id', inverse.series_id);
      if (error) return { ok: false, reason: error.message };
      return { ok: true };
    }

    case 'restore_row': {
      // Conflict check: if the row was edited since we journaled, refuse.
      const { data: cur } = await supa
        .from('tasks')
        .select('updated_at')
        .eq('user_id', userId)
        .eq('id', inverse.id)
        .maybeSingle();
      if (
        cur?.updated_at &&
        inverse.before_updated_at &&
        new Date(cur.updated_at).getTime() > new Date(inverse.before_updated_at).getTime()
      ) {
        return { ok: false, reason: 'superseded' };
      }
      const before = inverse.before || {};
      const { error } = await supa
        .from('tasks')
        .upsert({ ...before }, { onConflict: 'id' });
      if (error) return { ok: false, reason: error.message };
      return { ok: true };
    }

    case 'restore_rows': {
      const rows = (inverse.before || []).map((r) => ({ ...r }));
      if (!rows.length) return { ok: true };
      const { error } = await supa
        .from('tasks')
        .upsert(rows, { onConflict: 'id' });
      if (error) return { ok: false, reason: error.message };
      return { ok: true };
    }

    case 'insert_rows': {
      const rows = (inverse.rows || []).map((r) => ({ ...r }));
      if (!rows.length) return { ok: true };
      const { error } = await supa
        .from('tasks')
        .upsert(rows, { onConflict: 'id' });
      if (error) return { ok: false, reason: error.message };
      return { ok: true };
    }

    case 'replace_set': {
      // Drop the inserted rows, then restore the previously-deleted set.
      const insertedIds = inverse.inserted_ids || [];
      if (insertedIds.length) {
        const { error } = await supa
          .from('tasks')
          .delete()
          .eq('user_id', userId)
          .in('id', insertedIds);
        if (error) return { ok: false, reason: error.message };
      }
      const restore = (inverse.deleted || []).map((r) => ({ ...r }));
      if (restore.length) {
        const { error } = await supa
          .from('tasks')
          .upsert(restore, { onConflict: 'id' });
        if (error) return { ok: false, reason: error.message };
      }
      return { ok: true };
    }

    case 'restore_profile_field': {
      const { error } = await supa
        .from('profiles')
        .update({ [inverse.field]: inverse.before })
        .eq('id', userId);
      if (error) return { ok: false, reason: error.message };
      return { ok: true };
    }

    default:
      return { ok: false, reason: `unknown inverse.type ${inverse.type}` };
  }
}

async function execUndoLast(session, call) {
  const { supa, userId } = session;
  const n = Math.max(1, Math.min(20, Number(call.args?.n) || 1));
  // popLatest returns oldest-first; reverse so we apply latest-first.
  const candidates = (await popLatest(supa, userId, session.sessionId, n)).reverse();
  const undone = [];
  for (const entry of candidates) {
    const res = await applyInverse(session, entry.inverse);
    if (res.ok) {
      try {
        await markUndone(supa, entry.id, false);
        undone.push({ id: entry.id, label: entry.label, ok: true });
      } catch (e) {
        undone.push({ id: entry.id, label: entry.label, ok: false, reason: e.message });
      }
    } else {
      // Mark superseded entries as undone-with-conflict so we don't keep
      // tripping over them on subsequent undos.
      if (res.reason === 'superseded') {
        try {
          await markUndone(supa, entry.id, true);
        } catch {}
      }
      undone.push({ id: entry.id, label: entry.label, ok: false, reason: res.reason });
    }
  }
  return {
    ok: true,
    payload: { undone, requested: n },
    inverse: { type: 'noop' },
  };
}

// ---------------------------------------------------------------------------
// PUBLIC ENTRYPOINT
// ---------------------------------------------------------------------------

async function executeTool(session, call) {
  if (!call || !call.name) {
    return {
      ok: false,
      payload: { error: 'missing call.name' },
      journal_entry: null,
    };
  }

  // `done` is a no-op terminator. No journal entry.
  if (call.name === 'done') {
    const summary = String(call.args?.summary || '').slice(0, 200);
    return {
      ok: true,
      payload: { summary },
      journal_entry: null,
    };
  }

  let result;
  try {
    switch (call.name) {
      case 'create_task':
        result = await execCreateTask(session, call);
        break;
      case 'update_task':
        result = await execUpdateTask(session, call);
        break;
      case 'delete_task':
        result = await execDeleteTask(session, call);
        break;
      case 'update_meal_default':
        result = await execUpdateMealDefault(session, call);
        break;
      case 'upsert_constraint':
        result = await execUpsertConstraint(session, call);
        break;
      case 'undo_last':
        result = await execUndoLast(session, call);
        break;
      default:
        return {
          ok: false,
          payload: { error: `unknown tool ${call.name}` },
          journal_entry: null,
        };
    }
  } catch (e) {
    return {
      ok: false,
      payload: { error: e.message || String(e) },
      journal_entry: null,
    };
  }

  if (!result.ok) {
    return {
      ok: false,
      payload: { error: result.error || 'tool failed' },
      journal_entry: null,
    };
  }

  // Journal everything that mutated (skip undo_last itself — the undone
  // entries are already marked, so we'd never want to "undo an undo" via
  // the same journal stream).
  let journalEntry = null;
  if (call.name !== 'undo_last' && result.inverse && result.inverse.type !== 'noop') {
    const label = labelFor(call, result.payload);
    try {
      const id = await recordEntry(session.supa, {
        user_id: session.userId,
        session_id: session.sessionId,
        utterance_seg_id: session.segId ?? null,
        call_id: call.id || `${call.name}:${randomUUID()}`,
        tool_name: call.name,
        inverse: result.inverse,
        label,
      });
      journalEntry = {
        id,
        label,
        tool_name: call.name,
        inverse_summary: inverseSummary(result.inverse),
      };
    } catch (e) {
      // Mutation already happened; surface the journal failure to the model
      // so it can react, but don't lie about ok.
      journalEntry = null;
      result.payload = { ...(result.payload || {}), journal_error: e.message };
    }
  } else if (call.name === 'upsert_constraint') {
    // Constraints are decay-managed and not undoable; we still surface a
    // synthetic journal_entry so the client can render an info chip without
    // an undo affordance.
    journalEntry = {
      id: null,
      label: labelFor(call, result.payload),
      tool_name: call.name,
      inverse_summary: 'noop',
    };
  } else if (call.name === 'undo_last') {
    journalEntry = {
      id: null,
      label: labelFor(call, result.payload),
      tool_name: call.name,
      inverse_summary: 'noop',
    };
  }

  return {
    ok: true,
    payload: result.payload,
    journal_entry: journalEntry,
  };
}

// Local copy: server.js has its own addDays but we don't import to avoid the
// circular load cost. Same UTC math.
function addDays(yyyyMmDd, n) {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

module.exports = { executeTool, labelFor };
