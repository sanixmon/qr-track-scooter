// ── Id generation ──────────────────────────────────────────
// IDs look like `decision-042`. The numeric part is derived from the highest
// existing number of the same type + 1, so generation is stateless and
// deterministic (no external counter file needed).

const ID_RE = /^([a-z]+)-(\d+)$/

/** Extract the numeric sequence of an id, or -1. */
export function idNumber(id) {
  const m = ID_RE.exec(String(id ?? ''))
  return m ? Number(m[2]) : -1
}

/**
 * Build the next id for `type` given an array of existing ids.
 * The generated id is never reused even if entries were deleted.
 */
export function createId(type, existingIds) {
  let max = 0
  for (const id of existingIds) {
    const n = idNumber(id)
    if (idNumber(id) > max && String(id).startsWith(`${type}-`)) max = n
  }
  return `${type}-${String(max + 1).padStart(3, '0')}`
}
