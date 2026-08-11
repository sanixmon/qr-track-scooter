/**
 * Pure helpers for evaluating per-unit device conditions.
 * Shared by ScooterCard (alert badges) and ScooterDetailModal (tone coloring).
 */

// Fields whose non-normal value is a hard failure (red)
const BAD_VALUES = {
  setelan: 'tidak',
  lampu: 'tidak',
  baterai: 'drop',
  rem: 'rusak',
  ban: 'botak',
}

/** Red-tier: component is broken / missing. */
export function isBadField(key, value) {
  if (!value) return false
  if (key === 'monitor') return value !== 'normal'
  return value === BAD_VALUES[key]
}

/** Yellow-tier warning (e.g. tire tread thin but still usable). */
export function isWarnField(key, value) {
  if (!value) return false
  return key === 'ban' && value === 'tipis'
}

/** Tone for display: 'none' (never checked) | 'bad' | 'warn' | 'good'. */
export function fieldTone(key, value, hasCondition) {
  if (!hasCondition) return 'none'
  if (isBadField(key, value)) return 'bad'
  if (isWarnField(key, value)) return 'warn'
  return 'good'
}

/** Build list of { text, tone } issues for card badges. */
export function buildIssueList(condition) {
  if (!condition) return []
  const issues = []
  if (condition.baterai === 'drop') issues.push({ text: 'Baterai drop', tone: 'bad' })
  if (condition.lampu === 'tidak') issues.push({ text: 'Lampu tidak nyala', tone: 'bad' })
  if (condition.monitor && condition.monitor === 'lain' && condition.monitor_detail) {
    issues.push({ text: condition.monitor_detail, tone: 'bad' })
  } else if (condition.monitor && condition.monitor !== 'normal') {
    issues.push({ text: `Error ${String(condition.monitor).toUpperCase()}`, tone: 'bad' })
  }
  if (condition.rem === 'rusak') issues.push({ text: 'Rem rusak', tone: 'bad' })
  if (condition.ban === 'botak') issues.push({ text: 'Ban botak', tone: 'bad' })
  if (condition.ban === 'tipis') issues.push({ text: 'Ban tipis', tone: 'warn' })
  if (condition.setelan === 'tidak') issues.push({ text: 'Spakbor tidak ada', tone: 'bad' })
  return issues
}
