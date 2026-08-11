// ── Context Builder ───────────────────────────────────────
// Assembles the final AI context for a new session from the persistent
// store, layer by layer, respecting a token budget. L0–L2 are always derived
// from compiled knowledge; L3 is request-relevant; L4/L5 are optional
// (historical summaries / raw conversation) and gated by `layers`.

import fs from 'node:fs'
import path from 'node:path'
import { rankRelevant } from './relevance.js'

export const LAYER_NAMES = ['l0', 'l1', 'l2', 'l3', 'l4', 'l5']

export function estimateTokens(text) {
  return Math.ceil(String(text).length / 4)
}

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

export class ContextBuilder {
  /**
   * @param {{ store: object, sessionsDir?: string, now?: () => number }} opts
   */
  constructor({ store, sessionsDir = null, now = () => Date.now() } = {}) {
    if (!store) throw new Error('ContextBuilder requires { store }')
    this.store = store
    this.sessionsDir = sessionsDir
    this.now = now
  }

  renderL0() {
    const s = this.store
    const parts = []
    parts.push(bullets(s.list({ type: 'goal', status: 'active' }).filter(e => e.importance >= IMPORTANT), 'Goals'))
    parts.push(bullets(s.list({ type: 'preference', status: 'active' }).filter(e => e.importance >= IMPORTANT), 'User Preferences'))
    parts.push(bullets(s.list({ type: 'assumption', status: 'active' }).filter(e => e.importance >= IMPORTANT), 'Assumptions'))
    parts.push(bullets(s.list({ type: 'question', status: 'active' }), 'Open Questions'))
    parts.push(bullets(s.list({ type: 'lesson', status: 'active' }), 'Lessons Learned'))
    parts.push(bullets(s.list({ type: 'fact', status: 'active' }).filter(e => e.importance >= 4), 'Key Facts'))
    return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  }

  renderL1() {
    const projects = this.store.list({ type: 'project', status: 'active' })
    return bullets(projects, 'Project Information')
  }

  renderL2() {
    const s = this.store
    const decisions = s.list({ type: 'decision', status: 'active' })
    const constraints = s.list({ type: 'constraint', status: 'active' })
    const superseded = s.list({ type: 'decision', status: 'superseded' }).filter(d => d.superseded_by)
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

  renderL3(request, { includeObsolete = false, k = 8 } = {}) {
    const hits = rankRelevant(this.store.snapshot().entries, request, {
      k,
      includeObsolete,
      now: this.now(),
    })
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
    // Reads compiled session summaries (session-*.md summary line).
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
   * @param {{ layers?: string[], maxTokens?: number, includeObsolete?: boolean, rawMessages?: Array<{role,content}> }} opts
   * @returns {{ text: string, tokens: number, included: string[], omitted: string[] }}
   */
  build(request, { layers = ['l0', 'l1', 'l2', 'l3'], maxTokens = 2500, includeObsolete = false, rawMessages = [] } = {}) {
    const wanted = layers.filter(l => LAYER_NAMES.includes(l))

    const sections = []
    if (wanted.includes('l0')) sections.push({ key: 'l0', header: 'L0 — Core Context', body: this.renderL0() })
    if (wanted.includes('l1')) sections.push({ key: 'l1', header: 'L1 — Project / Domain', body: this.renderL1() })
    if (wanted.includes('l2')) sections.push({ key: 'l2', header: 'L2 — Active Decisions & Constraints', body: this.renderL2() })
    if (wanted.includes('l3')) sections.push({ key: 'l3', header: 'L3 — Relevant Knowledge', body: this.renderL3(request, { includeObsolete }) })
    if (wanted.includes('l4')) sections.push({ key: 'l4', header: 'L4 — Historical Context', body: this.renderL4() })

    // L5 raw conversation — fallback only when L3 found nothing.
    if (wanted.includes('l5') && rawMessages.length) {
      const hasL3 = sections.some(s => s.key === 'l3' && s.body)
      if (!hasL3) {
        const body = rawMessages.slice(-10).map(m => `- [${m.role}] ${m.content}`).join('\n')
        sections.push({ key: 'l5', header: 'L5 — Raw Conversation (fallback)', body })
      }
    }

    const included = []
    const omitted = []
    const chunks = []
    let tokens = 0
    if (request && wanted.length) {
      const header = `# AI Context — request: "${request}"\n\n`
      chunks.push(header)
      tokens += estimateTokens(header)
    }

    for (const sec of sections) {
      if (!sec.body) continue
      const block = `## ${sec.header}\n${sec.body}\n\n`
      const t = estimateTokens(block)
      if (tokens + t > maxTokens && included.length) {
        omitted.push(sec.key)
        continue
      }
      chunks.push(block)
      tokens += t
      included.push(sec.key)
    }

    const text = chunks.join('').trimEnd() + '\n'
    return { text, tokens: estimateTokens(text), included, omitted }
  }
}
