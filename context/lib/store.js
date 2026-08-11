// ── ContextStore: contract + in-memory implementation ─────
// All higher layers (compiler, builder, sessions) depend only on this
// interface, so the storage backend can be swapped (SQLite, vector DB, …).

import { createId } from './ids.js'
import { keywordTokens } from './normalize.js'
import { searchEntries, rankRelevant } from './relevance.js'

export const ENTRY_TYPES = [
  'fact', 'decision', 'preference', 'project', 'constraint', 'state',
  'goal', 'term', 'assumption', 'question', 'task', 'lesson', 'speculation',
]

export const ENTRY_STATUSES = [
  'active', 'superseded', 'deprecated', 'uncertain', 'temporary', 'done',
]

// Types whose same-topic claims are mutually exclusive (single active truth).
export const SUPERSEDE_TYPES = new Set(['fact', 'state', 'decision', 'constraint'])

/** Contract — implementations must override these methods. */
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
  constructor({ now = () => Date.now() } = {}) {
    super()
    this.now = now
    this._entries = new Map() // id → entry
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
      entry.id = createId(entry.type, this._entries.keys())
    }
    return entry
  }

  get(id) {
    const entry = this._entries.get(id)
    return entry ? { ...entry } : null
  }

  list({ type, status, topic, ids, limit } = {}) {
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

  supersede(id, { supersededBy = null, reason = '' } = {}) {
    const existing = this._entries.get(id)
    if (!existing) return null
    const merged = {
      ...existing,
      status: 'superseded',
      superseded_by: supersededBy,
      meta: { ...existing.meta, superseded_reason: reason || existing.meta?.superseded_reason || '' },
      last_verified: new Date(this.now()).toISOString(),
    }
    this._entries.set(id, merged)
    return { ...merged }
  }

  delete(id) {
    return this._entries.delete(id)
  }

  search(query, opts = {}) {
    return searchEntries(this._entries.values(), query, { now: this.now(), ...opts })
  }

  getRelevant(query, opts = {}) {
    return rankRelevant(this._entries.values(), query, { now: this.now(), ...opts })
  }

  snapshot() {
    const entries = [...this._entries.values()].map(e => ({ ...e }))
    const stats = {
      total: entries.length,
      by_status: countBy(entries, 'status'),
      by_type: countBy(entries, 'type'),
    }
    return { entries, stats }
  }

  clear() {
    this._entries.clear()
    return true
  }
}

function countBy(entries, key) {
  const out = {}
  for (const e of entries) out[e[key]] = (out[e[key]] ?? 0) + 1
  return out
}
