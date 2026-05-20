// Routine duration inference. Wraps the routine_duration_stats RPC introduced
// in supabase/migrations/20260514150000_routine_durations_view.sql. Returns the
// top 10 candidates by `n` (sample count). Returns [] if the RPC is missing —
// safe to deploy ahead of the DB migration.

async function inferRoutineDurations(supa, user_id) {
  try {
    const { data, error } = await supa.rpc('routine_duration_stats', { p_user: user_id });
    if (error) {
      // 42883 = function does not exist; PGRST202/PGRST301 = postgrest schema
      // miss. Treat all "not found" classes as a graceful empty.
      const code = error.code || '';
      if (code === '42883' || code.startsWith('PGRST') || /does not exist/i.test(error.message || '')) {
        return [];
      }
      console.warn('[inference] routine_duration_stats failed:', error.message);
      return [];
    }
    const rows = data ?? [];
    // RPC already orders by n desc + limit 50; cap to top 10 here.
    return rows.slice(0, 10);
  } catch (e) {
    console.warn('[inference] routine_duration_stats threw:', e.message);
    return [];
  }
}

module.exports = { inferRoutineDurations };
