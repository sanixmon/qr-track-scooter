// ── Deterministic relevance ranking ───────────────────────
// Rule-based scoring (MVP per spec): keyword overlap × importance × status ×
// confidence × recency. The scoring function is isolated so a vector/embedding
// scorer can be swapped later without changing the public interface.

import { tokenize, estimateTokens } from '../shared/normalize.js'

const STATUS_FACTOR = {
  active: 1,
  temporary: 0.8,
  uncertain: 0.6,
  done: 0.5,
  superseded: 0,
  deprecated: 0,
}

const RECENCY_HALF_LIFE_MS = 30 * 24 * 3600 * 1000 // 30 days

function tsOf(entry) {
  const t = entry.last_verified || entry.created_at
  const n = new Date(t).getTime()
  return Number.isFinite(n) ? n : Date.now()
}

/**
 * Score an entry against context tokens.
 * Returns 0 when there is no keyword overlap, or when the status excludes it
 * (superseded/deprecated) unless `includeObsolete` is set.
 */
export function scoreEntry(entry, contextTokens, { now = Date.now(), includeObsolete = false } = {}) {
  const rawFactor = STATUS_FACTOR[entry.status] ?? 1
  // Obsolete items are only retrievable when explicitly requested, and even
  // then they rank far below active knowledge.
  if (rawFactor === 0 && !includeObsolete) return 0
  const statusFactor = rawFactor === 0 ? 0.15 : rawFactor

  const haystack = `${entry.content} ${(entry.keywords ?? []).join(' ')}`.toLowerCase()
  let overlap = 0
  for (const t of contextTokens) if (haystack.includes(t)) overlap++
  if (overlap === 0) return 0

  const base = overlap / Math.max(1, contextTokens.length)
  const age = Math.max(0, now - tsOf(entry))
  const recency = Math.exp(-age / RECENCY_HALF_LIFE_MS)
  const importance = Math.min(5, Math.max(1, entry.importance ?? 2)) / 5
  const confidence = Math.min(1, Math.max(0, entry.confidence ?? 0.5))

  return base * (0.5 + 0.5 * importance) * statusFactor * confidence * (0.6 + 0.4 * recency)
}

/** Ranked search: returns [{ entry, score }] sorted desc (tie-break by id). */
export function searchEntries(entries, context, opts = {}) {
  const tokens = tokenize(context).filter(t => t.length > 1)
  if (tokens.length === 0) return []
  const results = []
  for (const entry of entries) {
    const score = scoreEntry(entry, tokens, opts)
    if (score > 0) results.push({ entry, score })
  }
  results.sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
  return results
}

/**
 * Top-k relevant entries with scores, filtered by minScore and capped by a
 * cumulative token `budget` (L3 per-layer budget enforcement — items are
 * taken in ranking order, so the highest-ranked ones survive).
 */
export function rankRelevant(entries, context, { k = 8, minScore = 0.05, budget = 0, ...opts } = {}) {
  let ranked = searchEntries(entries, context, opts).filter(r => r.score >= minScore)
  if (budget > 0) {
    const out = []
    let tokens = 0
    for (const r of ranked) {
      const t = estimateTokens(r.entry.content)
      if (tokens + t > budget && out.length) break
      out.push(r)
      tokens += t
    }
    ranked = out
  }
  return ranked.slice(0, k)
}
