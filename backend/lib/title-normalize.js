const STOPWORDS = ['the', 'a', 'to', 'go', 'sesh', 'session', 'class', 'practice'];
const STOPWORD_RE = new RegExp(`\\s+(${STOPWORDS.join('|')})\\s+`, 'g');

function normalizeTitle(raw) {
  if (raw == null) return '';
  let t = String(raw).toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  t = t.replace(STOPWORD_RE, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

module.exports = { normalizeTitle };
