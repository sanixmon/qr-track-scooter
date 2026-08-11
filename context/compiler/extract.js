// ── Deterministic extraction ──────────────────────────────
// Splits conversation into utterances and classifies each into one of the
// knowledge types. Rule-based by design: deterministic, no external model.
// To upgrade to LLM-based extraction, replace extractCandidates() with a
// function returning the same shape — the compiler pipeline stays unchanged.

import { keywordTokens } from '../shared/normalize.js'
import { extractTopic } from './topics.js'

const SENTENCE_SPLIT = /(?<=[.!?…])\s+|\n+/g

export function splitUtterances(content) {
  return String(content ?? '')
    .split(SENTENCE_SPLIT)
    .map(s => s.trim())
    .filter(s => s.length > 2)
}

/**
 * Classify a single utterance.
 * @returns {{type, confidence, importance} | null}
 */
export function classifyUtterance(text, { role = 'user' } = {}) {
  const t = text.trim()
  const low = t.toLowerCase()
  const isUser = role === 'user'
  const has = (...words) => words.some(w => low.includes(w))

  // 1) Question — only user questions become open questions.
  if (isUser && (t.endsWith('?') || /^(apakah|bagaimana|kenapa|mengapa|kapan|di mana|berapa|gimana|bisakah|apa|what|how|why|when|where|which|should|does)\b/i.test(low))) {
    return { type: 'question', confidence: 0.9, importance: 2 }
  }

  // 2) Negative constraints win over decision markers ("jangan pakai X").
  if (has('jangan', 'tidak boleh', 'tidak bisa', 'never use', 'avoid', 'hindari')) {
    return { type: 'constraint', confidence: 0.85, importance: 4 }
  }

  // 3) Speculation — low confidence, never supersedes anything.
  if (has('mungkin', 'sepertinya', 'kayaknya', 'probably', 'maybe', 'bisa jadi', 'kemungkinan', 'could be')) {
    return { type: 'speculation', confidence: 0.3, importance: 1 }
  }

  // 4) Terminology / glossary definition.
  if (
    has('disebut', 'istilah', 'artinya', 'definisi', 'define', 'glossary', 'means', 'istilahnya') ||
    /["“„]([^"”]+)["”]\s+(adalah|artinya|yaitu|is|means)/.test(t) ||
    /^([a-z0-9][\w -]{1,30})\s*(:|=|adalah|is)\s+(.+)$/i.test(t)
  ) {
    return { type: 'term', confidence: 0.85, importance: 3 }
  }

  // 5) Decision — concrete choices.
  if (
    has('pakai', 'gunakan', 'pilih', 'memilih', 'memutuskan', 'putuskan', 'keputusan',
      'setuju', 'migrate', 'migrasi', 'pindah ke', 'go with', 'decide', 'decided',
      'choose', 'dipakai', 'kita pake', 'kita pakai', 'sekarang pakai', 'sudah pakai') ||
    /\buse[sd]?\b/i.test(low)
  ) {
    return {
      type: 'decision',
      confidence: has('sudah', 'sekarang', 'finally', 'akhirnya') ? 0.95 : 0.85,
      importance: 4,
    }
  }

  // 6) Constraint.
  if (has('harus', 'wajib', 'must', 'cannot', "can't", 'maksimal', 'minimal', 'batas', 'hanya boleh', 'limit')) {
    return { type: 'constraint', confidence: 0.8, importance: 4 }
  }

  // 7) Preference.
  if (has('saya suka', 'aku suka', 'prefer', 'preferensi', 'lebih suka', 'saya mau', 'aku mau', 'kesukaan', 'preferred')) {
    return { type: 'preference', confidence: 0.85, importance: 3 }
  }

  // 8) Goal.
  if (has('tujuan', 'goal', 'target', 'sasaran', 'ingin mencapai', 'objective', 'mau mencapai')) {
    return { type: 'goal', confidence: 0.75, importance: 4 }
  }

  // 9) Assumption.
  if (has('asumsi', 'anggap', 'asumsikan', 'diasumsikan', 'assume', 'assuming', 'dengan asumsi', 'seandainya', 'andaikan')) {
    return { type: 'assumption', confidence: 0.6, importance: 2 }
  }

  // 10) Lesson learned.
  if (has('pelajaran', 'lesson', 'ternyata', 'pengalaman', 'best practice', 'jangan diulangi', 'belajar dari', 'alhasil')) {
    return { type: 'lesson', confidence: 0.85, importance: 3 }
  }

  // 11) Current state / status.
  if (has('sekarang', 'saat ini', 'status', 'currently', 'sedang dalam', 'sedang proses', 'berjalan', 'masih aktif', 'berhenti', 'offline', 'online')) {
    return { type: 'state', confidence: 0.7, importance: 2 }
  }

  // 12) Task (pending work) — only from user directives.
  if (isUser && has('tolong', 'bantu', 'buat', 'bikin', 'buatkan', 'implement', 'tambahkan', 'fix', 'perbaiki', 'selesaikan', 'siapkan', 'ubah', 'ganti ke', 'hapus', 'migrasikan', 'please', 'add ')) {
    return { type: 'task', confidence: 0.8, importance: 3 }
  }

  // 13) Fallback: declarative statement → fact.
  if (tokenizeCount(low) >= 2 && t.length <= 300) {
    return { type: 'fact', confidence: 0.6, importance: 2 }
  }

  return null
}

function tokenizeCount(text) {
  return text.split(/\s+/).filter(Boolean).length
}

/**
 * Extract candidate entries from a conversation.
 * @param {Array<{role:string, content:string}>} messages
 * @param {{ sourceSession?: string, now?: () => number }} opts
 * @returns {Array<object>} raw candidates (no id — store assigns it)
 */
export function extractCandidates(messages, { sourceSession = null, now = () => Date.now() } = {}) {
  const candidates = []
  for (const msg of messages) {
    if (!msg || msg.role === 'system' || !msg.content) continue
    for (const utterance of splitUtterances(msg.content)) {
      const cls = classifyUtterance(utterance, { role: msg.role })
      if (!cls) continue
      const topic = extractTopic(utterance)
      // Speculation is by nature temporary — it must never look like settled
      // knowledge and never supersedes an active claim.
      const status = cls.type === 'speculation' ? 'temporary' : 'active'
      candidates.push({
        type: cls.type,
        content: utterance,
        topic: topic.topic,
        topicStable: topic.stable,
        confidence: cls.confidence,
        importance: cls.importance,
        keywords: keywordTokens(utterance),
        source_session: sourceSession,
        created_at: new Date(now()).toISOString(),
        last_verified: new Date(now()).toISOString(),
        status,
        // Heuristic redaction flag (LLM extractor can do this more accurately).
        sensitive: isLikelySensitive(utterance),
        meta: { role: msg.role },
      })
    }
  }
  return candidates
}

// Conservative heuristic for the rule-based extractor: strings that look like
// credentials / internal URLs / keys are flagged sensitive so they never reach
// human-readable markdown.
const SENSITIVE_RE =
  /(api[\s_-]?key|password|passwd|secret|token|credential|access[\s_-]?key|private[\s_-]?key|-----begin|authorization|bearer\s+[a-z0-9]+|sk_live|pk_live|sk_test|ghp_|sk-)/i

function isLikelySensitive(text) {
  return SENSITIVE_RE.test(String(text ?? ''))
}

/**
 * Rule-based extractor — deterministic fallback / mock for the LLM extractor.
 * Implements the same async `extract()` interface as `LlmExtractor` so the
 * compiler can swap them freely.
 */
export class RuleExtractor {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now
    this.kind = 'rule'
  }

  async extract(messages, { sourceSession = null, now = this.now } = {}) {
    return extractCandidates(messages, { sourceSession, now })
  }
}
