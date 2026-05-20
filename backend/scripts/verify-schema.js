// One-off schema check. Reads SUPABASE_URL + SUPABASE_ANON_KEY from .env and
// pokes the tables this codebase depends on. Won't print rows — only column
// names and whether the table is reachable under the anon key's RLS view.
//
// Run: `cd backend && node scripts/verify-schema.js`

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

const url =
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supa = createClient(url, key);

const CHECKS = [
  {
    table: 'profiles',
    columns: [
      'id',
      'name',
      'goal',
      'onboarded',
      'breakfast_time_minutes',
      'lunch_time_minutes',
      'dinner_time_minutes',
      'morning_start_minutes',
      'afternoon_start_minutes',
      'evening_start_minutes',
    ],
  },
  {
    table: 'tasks',
    columns: [
      'id',
      'user_id',
      'title',
      'date',
      'time_minutes',
      'duration_minutes',
      'category',
    ],
  },
  {
    table: 'user_constraints',
    columns: [
      'id',
      'user_id',
      'text',
      'category',
      'strength',
      'ref_count',
      'superseded_by',
    ],
  },
  {
    table: 'agent_journal',
    columns: ['id', 'user_id', 'session_id', 'call_id', 'tool_name'],
  },
];

(async () => {
  let allOk = true;
  for (const check of CHECKS) {
    process.stdout.write(`\n▸ ${check.table}\n`);
    // Probe each column by selecting it with limit 0 — succeeds if the
    // column exists (RLS may filter rows but won't hide schema errors).
    for (const col of check.columns) {
      const { error } = await supa.from(check.table).select(col).limit(0);
      if (error) {
        allOk = false;
        console.log(`   ✗ ${col}  — ${error.message}`);
      } else {
        console.log(`   ✓ ${col}`);
      }
    }
  }

  // Also probe the RPCs the agent relies on.
  console.log('\n▸ RPCs');
  for (const fn of [
    { name: 'get_top_constraints', args: { p_limit: 1 } },
    { name: 'upsert_constraint', args: null }, // dry — only checks existence
  ]) {
    if (fn.args === null) {
      // Just check the function is registered; we don't want to actually
      // insert a constraint here.
      const { error } = await supa.rpc(fn.name, {
        p_text: '__schema_probe__',
        p_category: 'other',
        p_strength: 'soft',
      });
      // Expect either success (under an authed session) or a specific RLS
      // error about no auth.uid(); both mean the function exists.
      if (
        error &&
        !/auth\.uid|null value|permission|jwt|policy/i.test(error.message)
      ) {
        allOk = false;
        console.log(`   ✗ ${fn.name}  — ${error.message}`);
      } else {
        console.log(`   ✓ ${fn.name}  (registered)`);
      }
    } else {
      const { error } = await supa.rpc(fn.name, fn.args);
      if (
        error &&
        !/auth\.uid|null value|permission|jwt|policy/i.test(error.message)
      ) {
        allOk = false;
        console.log(`   ✗ ${fn.name}  — ${error.message}`);
      } else {
        console.log(`   ✓ ${fn.name}  (registered)`);
      }
    }
  }

  console.log(
    `\n${allOk ? '✅ All expected tables, columns, and RPCs are present.' : '❌ Some checks failed — see above. The new migration probably needs to be applied (supabase db push or via Supabase Studio).'}`,
  );
  process.exit(allOk ? 0 : 1);
})();
