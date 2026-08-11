// ── Shared domain constants ─────────────────────────────────
// Single source of truth for scooter status, types, and device
// condition labels. Import these instead of redefining strings
// across pages/components (keeps the 4-status model consistent).

// ── Status ──────────────────────────────────────────────────
export const STATUS_LABELS = {
  available: 'Tersedia',
  'in-use': 'Online',
  rusak: 'Offline / Rusak',
  maintenance: 'Maintenance',
}

// Sort priority (used by tables/grids)
export const STATUS_ORDER = {
  available: 1,
  'in-use': 2,
  rusak: 3,
  maintenance: 4,
}

// ── Types ───────────────────────────────────────────────────
export const TYPE_LABELS = {
  sd: 'Standar (SD)',
  sj: 'Jumbo (SJ)',
}

// ── Device condition fields ─────────────────────────────────
// Order defines display order in forms & condition grids.
export const DEVICE_FIELDS = [
  { key: 'setelan',  label: 'Spakbor',     options: [['ada', 'Ada'], ['tidak', 'Tidak']] },
  { key: 'lampu',    label: 'Lampu',       options: [['nyala', 'Nyala'], ['tidak', 'Tidak']] },
  { key: 'baterai',  label: 'Baterai',     options: [['normal', 'Normal'], ['drop', 'Drop']] },
  { key: 'monitor',  label: 'Jenis Error', options: [['normal', 'Normal'], ['e2', 'E2'], ['e4', 'E4'], ['e16', 'E16'], ['e6', 'E6'], ['lain', 'Lain Lain']] },
  { key: 'rem',      label: 'Rem',         options: [['normal', 'Normal'], ['rusak', 'Rusak']] },
  { key: 'ban',      label: 'Ban',         options: [['botak', 'Botak'], ['tipis', 'Tipis'], ['aman', 'Aman']] },
]

// Human-readable label per value (used in Excel exports & summaries)
export const DEVICE_LABELS = {
  setelan: { ada: 'Ada', tidak: 'Tidak ada' },
  lampu: { nyala: 'Nyala', tidak: 'Tidak nyala' },
  baterai: { normal: 'Normal', drop: 'Drop' },
  monitor: {
    normal: 'Normal', e2: 'E2', e4: 'E4', e16: 'E16', e6: 'E6', lain: 'Lain-lain'
  },
  rem: { normal: 'Normal', rusak: 'Rusak' },
  ban: { aman: 'Aman', tipis: 'Tipis', botak: 'Botak' },
}
