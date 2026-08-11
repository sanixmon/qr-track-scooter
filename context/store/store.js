// ── ContextStore: contract + in-memory implementation ─────
// All higher layers (compiler, builder, sessions) depend only on this
// interface, so the storage backend can be swapped (SQLite, vector DB, …)
// without touching consumers.

import { nextId, maxCountersFromIds } from './ids.js'
import { keywordTokens } from '../shared/normalize.js'
import { searchEntries, rankRelevant } from '../retrieval/relevance.js'

export const ENTRY_TYPES = [
  'fact', 'decision', 'preference', 'project', 'constraint', 'state',
  'goal', 'term', 'assumption', 'question', 'task', 'lesson', 'speculation',
]

export const ENTRY_STATUSES = [
  'active', 'superseded', 'deprecated', 'uncertain', 'temporary', 'done',
]

// Types whose same-topic claims are mutually exclusive (single active truth).
export const SUPERSEDE_TYPES = new Set(['fact', 'state', 'decision', 'constraint'])

/**
 * Storage interface contract:
 *   get(id), list(opts), add(item), update(id, patch),
 *   supersede(oldId, newItem), delete(id),
 *   search(query, opts), getRelevant(context, opts),
 *   snapshot(sessionId), clear()
 */
export class ContextStore {
  get() { throw new Error('ContextStore.get() not implemented') }
  list() { throw new Error('ContextStore.list() not implemented') }
  add() { throw new Error('ContextStore.add() not implemented') }
  update() { throw new Error('ContextStore.update() not implemented') }
  supersede() { throw new Error('ContextStore.supersede() not implemented') }
  delete() { throw new Error('ContextStore.delete() not implemented') }
  search() { throw new Error('ContextStore.search() not implemented') }
  getRelevant() { throw new Error('ContextStore.getRelevant() not implemented') }
  snapshot() { throw new Error('ContextStore.snapshot() not implemented') }
  clear() { throw new Error('ContextStore.clear() not implemented') }
}

export function assertValidEntry(entry) {
  if (!entry || typeof entry !== 'object') throw new Error('entry must be an object')
  if (typeof entry.content !== 'string' || !entry.content.trim()) {
    throw new Error('entry.content must be a non-empty string')
  }
  if (!ENTRY_TYPES.includes(entry.type)) {
    throw new Error(`invalid entry.type "${entry.type}" (allowed: ${ENTRY_TYPES.join(', ')})`)
  }
  if (entry.status && !ENTRY_STATUSES.includes(entry.status)) {
    throw new Error(`invalid entry.status "${entry.status}"`)
  }
}

/** In-memory store — the reference implementation & test double. */
export class MemoryContextStore extends ContextStore {
  constructor({ now = () => Date.now(), counters = {} } = {}) {
    super()
    this.now = now
    this._entries = new Map() // id → entry
    this._counters = { ...counters }
    this._seedCountersFromEntries()
  }

  _seedCountersFromEntries() {
    const maxes = maxCountersFromIds(this._entries.keys())
    for (const [type, n] of Object.entries(maxes)) {
      if (n > (this._counters[type] ?? 0)) this._counters[type] = n
    }
  }

  /** Normalize + validate an entry, filling id/timestamps/keywords. */
  _prepare(input) {
    assertValidEntry(input)
    const ts = new Date(this.now()).toISOString()
    const entry = {
      id: input.id,
      type: input.type,
      content: input.content.trim(),
      topic: input.topic ?? '',
      keywords: input.keywords && input.keywords.length
        ? [...new Set(input.keywords.map(k => String(k).toLowerCase()))]
        : keywordTokens(input.content),
      status: input.status ?? 'active',
      // Privacy: sensitive items stay in the structured store but are redacted
      // from human-readable markdown (and omitted from AI context by default).
      sensitive: Boolean(input.sensitive),
      confidence: Math.min(1, Math.max(0, Number(input.confidence ?? 0.5))),
      importance: Math.min(5, Math.max(1, Math.round(Number(input.importance ?? 2)))),
      source_session: input.source_session ?? null,
      created_at: input.created_at ?? ts,
      last_verified: input.last_verified ?? ts,
      supersedes: input.supersedes ?? null,
      superseded_by: input.superseded_by ?? null,
      projects: Array.isArray(input.projects) ? [...input.projects] : [],
      meta: input.meta && typeof input.meta === 'object' ? { ...input.meta } : {},
    }
    if (!entry.id) {
      entry.id = nextId(entry.type, this._counters)
    }
    return entry
  }

  get(id) {
    const entry = this._entries.get(id)
    return entry ? { ...entry } : null
  }

  list({ type, status, topic, ids, sensitive, limit } = {}) {
    let items = [...this._entries.values()]
    if (type) items = items.filter(e => e.type === type)
    if (status) {
      const wanted = new Set(Array.isArray(status) ? status : [status])
      items = items.filter(e => wanted.has(e.status))
    }
    if (topic) items = items.filter(e => e.topic === topic)
    if (ids) {
      const wantedIds = new Set(ids)
      items = items.filter(e => wantedIds.has(e.id))
    }
    if (sensitive !== undefined) items = items.filter(e => e.sensitive === sensitive)
    items.sort((a, b) => a.id.localeCompare(b.id))
    if (limit) items = items.slice(0, limit)
    return items.map(e => ({ ...e }))
  }

  add(input) {
    const entry = this._prepare(input)
    if (this._entries.has(entry.id)) {
      throw new Error(`duplicate entry id "${entry.id}"`)
    }
    this._entries.set(entry.id, entry)
    return { ...entry }
  }

  update(id, patch) {
    const existing = this._entries.get(id)
    if (!existing) return null
    const merged = { ...existing, ...patch }
    assertValidEntry(merged)
    // Refresh derived keywords when the content actually changes (unless the
    // caller provided explicit keywords).
    if (patch.content && patch.content !== existing.content && !patch.keywords) {
      merged.keywords = keywordTokens(merged.content)
    }
    merged.last_verified = new Date(this.now()).toISOString()
    this._entries.set(id, merged)
    return { ...merged }
  }

  /**
   * Supersede `oldId` with a new item (lineage-preserving):
   *  - new item is added with `supersedes: oldId`
   *  - old item is marked `superseded` + `superseded_by: <new id>`
   * Returns the stored new item (or null if oldId is unknown).
   */
  supersede(oldId, newItem) {
    const old = this._entries.get(oldId)
    if (!old) return null
    const prepared = this._prepare({ ...newItem, supersedes: oldId })
    if (this._entries.has(prepared.id)) {
      throw new Error(`duplicate entry id "${prepared.id}"`)
    }
    this._entries.set(prepared.id, prepared)
    this._entries.set(oldId, {
      ...old,
      status: 'superseded',
      superseded_by: prepared.id,
      last_verified: new Date(this.now()).toISOString(),
    })
    return { ...prepared }
  }

  delete(id) {
    return this._entries.delete(id)
  }

  search(query, opts = {}) {
    return searchEntries(this._entries.values(), query, { now: this.now(), ...opts })
  }

  /** Rule-based retrieval; `budget` caps cumulative content tokens (L3 cap). */
  getRelevant(context, opts = {}) {
    return rankRelevant(this._entries.values(), context, { now: this.now(), ...opts })
  }

  snapshot(sessionId = null) {
    const entries = [...this._entries.values()]
      .filter(e => !sessionId || e.source_session === sessionId)
      .map(e => ({ ...e }))
    const stats = {
      total: entries.length,
      by_status: countBy(entries, 'status'),
      by_type: countBy(entries, 'type'),
    }
    return { entries, stats }
  }

  clear() {
    this._entries.clear()
    this._counters = {}
    return true
  }
}

function countBy(entries, key) {
  const out = {}
  for (const e of entries) out[e[key]] = (out[e[key]] ?? 0) + 1
  return out
}
