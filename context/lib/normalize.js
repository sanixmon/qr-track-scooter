// ── Text normalization & similarity (deterministic) ─────────

const STOPWORDS = new Set([
  // Indonesian
  'yang', 'dan', 'di', 'ke', 'dari', 'dengan', 'untuk', 'pada', 'adalah', 'ini',
  'itu', 'saya', 'aku', 'kamu', 'kita', 'kami', 'mereka', 'sudah', 'belum', 'akan',
  'tidak', 'juga', 'agar', 'supaya', 'karena', 'tapi', 'namun', 'atau', 'sebagai',
  'oleh', 'dalam', 'saat', 'seperti', 'bisa', 'dapat', 'harus', 'mau', 'ingin',
  'jadi', 'kalau', 'jika', 'maka', 'setelah', 'sebelum', 'waktu', 'hal', 'secara',
  'pun', 'bukan', 'yg', 'tsb', 'dgn', 'akan', 'ada', 'adanya', 'dgn', 'ketika',
  'selalu', 'sekali', 'banyak', 'sangat', 'lebih', 'paling', 'besar', 'kecil',
  // English
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
  'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'this', 'that', 'it',
  'its', 'we', 'you', 'they', 'them', 'i', 'me', 'my', 'our', 'your', 'their',
  'not', 'no', 'do', 'does', 'did', 'have', 'has', 'had', 'can', 'could', 'will',
  'would', 'should', 'must', 'from', 'as', 'so', 'if', 'then', 'than', 'when',
  'while', 'after', 'before', 'about', 'into', 'over', 'under', 'up', 'down',
  'out', 'off', 'just', 'very', 'also', 'there', 'here', 'what', 'which', 'who',
  'whom', 'how', 'why', 'all', 'any', 'some', 'more', 'most', 'other', 'such',
  'only', 'own', 'same', 'too', 'may', 'might', 'shall', 'need', 'using', 'use',
  'used', 'via', 'been', 'being', 'has', 'have', 'having',
])

/** Lowercase alphanumeric tokens (keeps hyphens). */
export function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** Stopword-stripped, whitespace-joined text. */
export function normalizeText(text) {
  const tokens = tokenize(text).filter(t => !STOPWORDS.has(t) && t.length > 1)
  return tokens.join(' ')
}

/** Unique significant keywords derived from a text. */
export function keywordTokens(text) {
  return [...new Set(normalizeText(text).split(' '))].filter(Boolean)
}

/** Jaccard similarity over token sets (raw, includes stopwords). */
export function jaccard(a, b) {
  const setA = new Set(tokenize(a))
  const setB = new Set(tokenize(b))
  if (setA.size === 0 || setB.size === 0) return 0
  let inter = 0
  for (const t of setA) if (setB.has(t)) inter++
  const union = new Set([...setA, ...setB]).size
  return inter / union
}

/** Normalized similarity (stopword-stripped). */
export function similarity(a, b) {
  const setA = new Set(normalizeText(a).split(' '))
  const setB = new Set(normalizeText(b).split(' '))
  if (setA.size === 0 || setB.size === 0) return 0
  let inter = 0
  for (const t of setA) if (setB.has(t)) inter++
  const union = new Set([...setA, ...setB]).size
  return inter / union
}
