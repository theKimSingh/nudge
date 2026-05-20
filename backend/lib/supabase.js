const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

function clientForUser(jwt) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

async function requireUser(req) {
  const auth = req.headers.authorization || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!jwt) {
    const err = new Error('Missing Authorization header');
    err.status = 401;
    throw err;
  }
  return requireUserFromToken(jwt);
}

// Standalone variant for callers that have a raw token (e.g. WS upgrade
// handlers parsing ?token= from the URL). Same return shape as requireUser.
async function requireUserFromToken(jwt) {
  if (!jwt) {
    const err = new Error('Missing token');
    err.status = 401;
    throw err;
  }
  const supabase = clientForUser(jwt);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    const err = new Error('Invalid JWT');
    err.status = 401;
    throw err;
  }
  return { user: data.user, supabase };
}

module.exports = { clientForUser, requireUser, requireUserFromToken };
