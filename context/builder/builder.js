// ── Context Builder ───────────────────────────────────────
// Assembles the final AI context for a new session from the persistent
// store, layer by layer. Per-layer token budgets (L0=300, L1=800, L2=800,
// L3=1500, L4=on-demand) are defined centrally in config.js and enforced
// here. Sensitive items are redacted unless `includeSensitive` is set.

import fs from 'node:fs'
import path from 'node:path'
import { rankRelevant } from '../retrieval/relevance.js'
import { estimateTokens } from '../shared/normalize.js'
import { resolveLayerBudgets } from '../config.js'

export { estimateTokens } from '../shared/normalize.js'

export const LAYER_NAMES = ['l0', 'l1', 'l2', 'l3', 'l4', 'l5']

const IMPORTANT = 3

function bullets(entries, label) {
  if (!entries.length) return ''
  const lines = entries.map(e => {
    const status = e.status && e.status !== 'active' ? ` [${e.status}]` : ''
    const conf = e.confidence < 0.6 ? ` (confidence ${e.confidence.toFixed(2)})` : ''
    return `- ${e.content}${status}${conf} — ${e.type}/${e.id}`
  })
  return `### ${label}\n${lines.join('\n')}\n`
}

/** Keep lines of a rendered block within a token budget. */
function fitToBudget(body, budget) {
  if (budget <= 0 || estimateTokens(body) <= budget) return body
  const lines = body.split('\n')
  const kept = []
  let tokens = 0
  for (const line of lines) {
    if (tokens + estimateTokens(line) > budget && kept.length) break
    kept.push(line)
    tokens += estimateTokens(line)
  }
  return kept.join('\n') + '\n'
}

export class ContextBuilder {
  /**
   * @param {{ store: object, sessionsDir?: string, now?: () => number, budgets?: object, env?: object }} opts
   */
  constructor({ store, sessionsDir = null, now = () => Date.now(), budgets = {}, env = null } = {}) {
    if (!store) throw new Error('ContextBuilder requires { store }')
    this.store = store
    this.sessionsDir = sessionsDir
    this.now = now
    this.budgets = budgets
    this.env = env ?? (typeof process !== 'undefined' ? process.env : {})
  }

  _visible(entries, includeSensitive) {
    return entries.filter(e => !e.sensitive || includeSensitive)
  }

  renderL0(includeSensitive = false) {
    const s = this.store
    const parts = []
    parts.push(bullets(this._visible(s.list({ type: 'goal', status: 'active' }).filter(e => e.importance >= IMPORTANT), includeSensitive), 'Goals'))
    parts.push(bullets(this._visible(s.list({ type: 'preference', status: 'active' }).filter(e => e.importance >= IMPORTANT), includeSensitive), 'User Preferences'))
    parts.push(bullets(this._visible(s.list({ type: 'assumption', status: 'active' }).filter(e => e.importance >= IMPORTANT), includeSensitive), 'Assumptions'))
    parts.push(bullets(this._visible(s.list({ type: 'question', status: 'active' }), includeSensitive), 'Open Questions'))
    parts.push(bullets(this._visible(s.list({ type: 'lesson', status: 'active' }), includeSensitive), 'Lessons Learned'))
    parts.push(bullets(this._visible(s.list({ type: 'fact', status: 'active' }).filter(e => e.importance >= 4), includeSensitive), 'Key Facts'))
    return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  }

  renderL1(includeSensitive = false) {
    return bullets(this._visible(this.store.list({ type: 'project', status: 'active' }), includeSensitive), 'Project Information')
  }

  renderL2(includeSensitive = false) {
    const s = this.store
    const decisions = this._visible(s.list({ type: 'decision', status: 'active' }), includeSensitive)
    const constraints = this._visible(s.list({ type: 'constraint', status: 'active' }), includeSensitive)
    const superseded = s.list({ type: 'decision', status: 'superseded' })
      .filter(d => d.superseded_by)
      .filter(d => !d.sensitive || includeSensitive)
    const parts = []

    if (decisions.length) {
      const lines = decisions.map(d => `- ${d.content} (${d.id})`)
      if (superseded.length) {
        lines.push('')
        lines.push('Superseded trail:')
        for (const d of superseded) {
          lines.push(`  - ~~${d.content}~~ → ${d.superseded_by} (${d.id})`)
        }
      }
      parts.push(`### Active Decisions\n${lines.join('\n')}\n`)
    }
    if (constraints.length) parts.push(bullets(constraints, 'Constraints'))
    return parts.join('\n').trim()
  }

  renderL3(request, { includeObsolete = false, includeSensitive = false, budget = 1500, k = 12 } = {}) {
    const entries = this.store.snapshot().entries.filter(e => !e.sensitive || includeSensitive)
    const hits = rankRelevant(entries, request, { k, budget, includeObsolete, now: this.now() })
    if (!hits.length) return ''
    const lines = hits.map(h => {
      const e = h.entry
      const status = e.status !== 'active' ? ` [${e.status}]` : ''
      return `- ${e.content}${status} (${e.id}, relevance ${h.score.toFixed(2)})`
    })
    return `### Relevant Knowledge\n${lines.join('\n')}\n`
  }

  renderL4() {
    if (!this.sessionsDir) return ''
    try {
      const dir = this.sessionsDir
      if (!fs.existsSync(dir)) return ''
      const files = fs.readdirSync(dir).filter(f => /^session-.*\.md$/.test(f)).sort().slice(-10)
      const summaries = []
      for (const f of files) {
        const body = fs.readFileSync(path.join(dir, f), 'utf8')
        const m = body.match(/^summary:\s*(.+)$/m)
        if (m) summaries.push(`- ${f.replace(/\.md$/, '')}: ${m[1].trim()}`)
      }
      if (!summaries.length) return ''
      return `### Historical Sessions\n${summaries.join('\n')}\n`
    } catch {
      return ''
    }
  }

  /**
   * @param {string} request
   * @param {{
   *   layers?: string[],
   *   budgets?: object,            // override per-layer token budget (config.js)
   *   maxTokens?: number,          // total cap (default: sum of per-layer budgets)
   *   includeObsolete?: boolean,
   *   includeSensitive?: boolean,
   *   rawMessages?: Array<{role, content}>,
   * }} opts
   * @returns {{ text, tokens, included: string[], omitted: string[], layerTokens: object }}
   */
  build(request, {
    layers = ['l0', 'l1', 'l2', 'l3'],
    budgets = {},
    maxTokens = null,
    includeObsolete = false,
    includeSensitive = false,
    rawMessages = [],
  } = {}) {
    const wanted = layers.filter(l => LAYER_NAMES.includes(l))
    const layerBudgets = resolveLayerBudgets({ ...this.budgets, ...budgets }, this.env)

    const sections = []
    if (wanted.includes('l0')) sections.push({ key: 'l0', header: 'L0 — Core Context', body: this.renderL0(includeSensitive) })
    if (wanted.includes('l1')) sections.push({ key: 'l1', header: 'L1 — Project / Domain', body: this.renderL1(includeSensitive) })
    if (wanted.includes('l2')) sections.push({ key: 'l2', header: 'L2 — Active Decisions & Constraints', body: this.renderL2(includeSensitive) })
    if (wanted.includes('l3')) {
      sections.push({
        key: 'l3', header: 'L3 — Relevant Knowledge',
        body: this.renderL3(request, { includeObsolete, includeSensitive, budget: layerBudgets.l3 }),
      })
    }
    if (wanted.includes('l4')) sections.push({ key: 'l4', header: 'L4 — Historical Context', body: this.renderL4() })

    // L5 raw conversation — fallback only when L3 found nothing.
    if (wanted.includes('l5') && rawMessages.length) {
      const hasL3 = sections.some(s => s.key === 'l3' && s.body)
      if (!hasL3) {
        const body = rawMessages.slice(-10).map(m => `- [${m.role}] ${m.content}`).join('\n')
        sections.push({ key: 'l5', header: 'L5 — Raw Conversation (fallback)', body })
      }
    }

    const totalBudget = maxTokens ?? wanted.reduce((sum, k) => sum + (layerBudgets[k] ?? 0), 0)

    const included = []
    const omitted = []
    const layerTokens = {}
    const chunks = []
    let tokens = 0
    if (request && wanted.length) {
      const header = `# AI Context — request: "${request}"\n\n`
      chunks.push(header)
      tokens += estimateTokens(header)
    }

    for (const sec of sections) {
      if (!sec.body) continue
      // Per-layer budget: truncate body to fit.
      const layerBudget = layerBudgets[sec.key] ?? 0
      const body = layerBudget > 0 ? fitToBudget(sec.body, layerBudget) : sec.body
      const block = `## ${sec.header}\n${body}\n\n`
      const t = estimateTokens(block)
      if (tokens + t > totalBudget && included.length) {
        omitted.push(sec.key)
        continue
      }
      chunks.push(block)
      tokens += t
      included.push(sec.key)
      layerTokens[sec.key] = t
    }

    const text = chunks.join('').trimEnd() + '\n'
    return { text, tokens: estimateTokens(text), included, omitted, layerTokens }
  }
}
