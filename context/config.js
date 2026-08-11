// ── Configuration (single source of truth) ─────────────────
// Per-layer token budgets are explicit constants here — never hardcoded
// scattered across files. All are overridable via createSystem({ budgets })
// or environment variables (CONTEXT_BUDGET_L0 … CONTEXT_BUDGET_L4).

// Target budgets (token per layer, "kasar" per spec — boleh disesuaikan
// tetapi harus eksplisit di satu tempat ini).
export const LAYER_BUDGETS = {
  l0: 300,   // Core Context
  l1: 800,   // Project / Domain
  l2: 800,   // Active Decisions & Constraints
  l3: 1500,  // Relevant Knowledge (dipotong berdasarkan ranking score)
  l4: 0,     // Historical — on-demand only, tidak masuk default budget
}

const ENV_PREFIX = 'CONTEXT_BUDGET_'

/** Resolve effective budgets: defaults → env → explicit overrides. */
export function resolveLayerBudgets(overrides = {}, env = {}) {
  const out = { ...LAYER_BUDGETS }
  for (const layer of Object.keys(out)) {
    const envVal = env[`${ENV_PREFIX}${layer.toUpperCase()}`]
    if (envVal != null && envVal !== '' && !Number.isNaN(Number(envVal))) {
      out[layer] = Number(envVal)
    }
    const override = overrides[layer]
    if (override != null && !Number.isNaN(Number(override))) {
      out[layer] = Number(override)
    }
  }
  return out
}
