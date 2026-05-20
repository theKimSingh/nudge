// agent_journal helpers. Inserts/reads use the per-request user-scoped Supabase
// client (see backend/lib/supabase.js → requireUser). The journal table's RLS
// allows owner SELECT; INSERTs require an owner insert policy on the journal
// migration (Agent A's responsibility) — the per-request client carries the
// user JWT so once that policy lands, writes work without a service-role key.

async function recordEntry(
  supa,
  { user_id, session_id, utterance_seg_id, call_id, tool_name, inverse, label },
) {
  const row = {
    user_id,
    session_id,
    utterance_seg_id: utterance_seg_id ?? null,
    call_id,
    tool_name,
    inverse,
    label,
  };
  const { data, error } = await supa
    .from('agent_journal')
    .insert(row)
    .select('id')
    .maybeSingle();

  if (!error && data) return data.id;

  // Idempotent replay: the unique (user, session, call) index collapses
  // retried inserts. Surface the existing row's id so the caller can proceed.
  const isUniqueViolation =
    error && (error.code === '23505' || /duplicate key|unique/i.test(error.message || ''));
  if (isUniqueViolation) {
    const { data: existing, error: selErr } = await supa
      .from('agent_journal')
      .select('id')
      .eq('user_id', user_id)
      .eq('session_id', session_id)
      .eq('call_id', call_id)
      .maybeSingle();
    if (!selErr && existing?.id) return existing.id;
  }

  const e = new Error(`journal insert failed: ${error?.message || 'unknown'}`);
  e.cause = error;
  throw e;
}

// Returns the newest `n` undoable entries OLDEST-FIRST. Callers reverse to
// iterate newest-first when applying inverses. This function does NOT mark
// anything undone — the caller calls markUndone after each inverse applies.
async function popLatest(supa, user_id, session_id, n) {
  const limit = Math.max(1, Math.min(20, Number(n) || 1));
  const { data, error } = await supa
    .from('agent_journal')
    .select(
      'id, session_id, utterance_seg_id, call_id, tool_name, inverse, label, applied_at',
    )
    .eq('user_id', user_id)
    .eq('session_id', session_id)
    .is('undone_at', null)
    .order('applied_at', { ascending: false })
    .limit(limit);
  if (error) {
    const e = new Error(`journal popLatest failed: ${error.message}`);
    e.cause = error;
    throw e;
  }
  // Oldest-first; caller does `.reverse()` to iterate latest-first.
  return (data ?? []).slice().reverse();
}

async function markUndone(supa, entry_id, conflict = false) {
  const patch = { undone_at: new Date().toISOString() };
  if (conflict) {
    // Re-fetch the inverse so we can stamp a conflict flag without losing it.
    const { data: cur } = await supa
      .from('agent_journal')
      .select('inverse')
      .eq('id', entry_id)
      .maybeSingle();
    const inv = (cur && cur.inverse) || {};
    patch.inverse = { ...inv, conflict: true };
  }
  const { error } = await supa.from('agent_journal').update(patch).eq('id', entry_id);
  if (error) {
    const e = new Error(`journal markUndone failed: ${error.message}`);
    e.cause = error;
    throw e;
  }
}

module.exports = { recordEntry, popLatest, markUndone };
