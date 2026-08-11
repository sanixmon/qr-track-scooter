// ── Id generation ──────────────────────────────────────────
// Format: `{type}-{zero-padded-sequential-number}` (contoh: decision-042).
// The counter per type lives in manifest.json (`id_counters`), so ids stay
// stable across restarts. MVP assumes single-writer — no concurrency/locking
// (TODO: add a lock if concurrent sessions ever write simultaneously).

const ID_RE = /^([a-z]+)-(\d+)$/

export function idNumber(id) {
  const m = ID_RE.exec(String(id ?? ''))
  return m ? Number(m[2]) : -1
}

/** Extract numeric sequences per type from a list of existing ids. */
export function maxCountersFromIds(ids) {
  const counters = {}
  for (const id of ids) {
    const m = ID_RE.exec(String(id ?? ''))
    if (!m) continue
    const type = m[1]
    const n = Number(m[2])
    if (n > (counters[type] ?? 0)) counters[type] = n
  }
  return counters
}

/**
 * Allocate the next id for `type`, advancing the counters map in place.
 * @param {string} type
 * @param {Record<string, number>} counters — mutated
 * @returns {string}
 */
export function nextId(type, counters) {
  const n = (counters[type] ?? 0) + 1
  counters[type] = n
  return `${type}-${String(n).padStart(3, '0')}`
}
