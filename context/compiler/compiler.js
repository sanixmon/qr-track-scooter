// ── Context Compiler ──────────────────────────────────────
// conversation → extract (LLM) → validate → deduplicate → resolve
// contradictions → update existing → mark obsolete → persist → snapshot
//
// Extraction is pluggable (see compiler/llm.js + compiler/extract.js):
//   - default: LlmExtractor (Claude) bila ANTHROPIC_API_KEY tersedia
//   - fallback: RuleExtractor (deterministik) bila key tidak ada / LLM gagal
// Compile hanya dipicu eksplisit via `compileSession(sessionId)` — tanpa
// auto-trigger berdasarkan jumlah pesan atau token.

import { similarity } from '../shared/normalize.js'
import { SUPERSEDE_TYPES } from '../store/store.js'
import { RuleExtractor } from './extract.js'

const MINI_KEYS = ['id', 'type', 'content', 'topic', 'status', 'confidence', 'importance', 'sensitive', 'source_session']

function mini(entry) {
  const out = {}
  for (const k of MINI_KEYS) if (entry[k] !== undefined && entry[k] !== null) out[k] = entry[k]
  return out
}

// Sensitive items never appear in the human-readable summary either.
function display(entry) {
  return entry.sensitive ? `[sensitive] (${entry.id})` : `${entry.content} (${entry.id})`
}

function buildSummary(sessionId, { newKnowledge, updated, superseded, decisions, openQuestions, pendingTasks }) {
  const parts = []
  parts.push(`Session ${sessionId}: ${newKnowledge.length} new, ${updated.length} verified, ${superseded.length} superseded.`)
  if (decisions.length) parts.push(`Decisions: ${decisions.map(display).join('; ')}.`)
  if (openQuestions.length) parts.push(`Open questions: ${openQuestions.map(display).join('; ')}.`)
  if (pendingTasks.length) parts.push(`Pending tasks: ${pendingTasks.map(display).join('; ')}.`)
  return parts.join(' ')
}

export class Compiler {
  /**
   * @param {{
   *   store: object,
   *   now?: () => number,
   *   extractor?: object,          // { async extract(messages, ctx) → candidates }
   *   fallbackExtractor?: object,  // dipakai bila extractor gagal/absent
   * }} opts
   */
  constructor({ store, now = () => Date.now(), extractor = null, fallbackExtractor = undefined } = {}) {
    if (!store) throw new Error('Compiler requires { store }')
    this.store = store
    this.now = now
    this.extractor = extractor
    // Default: rule-based fallback. Explicitly pass `null` to disable it
    // (then a failing LLM call propagates as an error).
    this.fallbackExtractor = fallbackExtractor === undefined
      ? new RuleExtractor({ now })
      : fallbackExtractor
  }

  async _extract(messages, ctx) {
    if (this.extractor) {
      try {
        const result = await this.extractor.extract(messages, ctx)
        const candidates = Array.isArray(result) ? result : (result?.candidates ?? [])
        return { candidates, extractor: this.extractor.kind ?? 'custom' }
      } catch (err) {
        if (!this.fallbackExtractor) throw err
        // LLM gagal (network / key invalid / response tidak valid) → fallback
        // deterministik agar sistem tetap berfungsi, dengan catatan di snapshot.
        console.warn(`[context] extractor failed (${err.message}); using rule-based fallback`)
        const fallback = await this.fallbackExtractor.extract(messages, ctx)
        return { candidates: fallback, extractor: 'rule-fallback' }
      }
    }
    const fallback = await this.fallbackExtractor.extract(messages, ctx)
    return { candidates: fallback, extractor: 'rule' }
  }

  /**
   * Compile a session's conversation into the persistent store.
   * @param {{ sessionId: string, messages: Array<{role, content}>, project?: string }} session
   * @returns {Promise<object>} snapshot
   */
  async compile({ sessionId, messages, project = null }) {
    if (!Array.isArray(messages)) throw new Error('compile() requires messages[]')

    const ctx = { sourceSession: sessionId, now: this.now }
    const { candidates, extractor } = await this._extract(messages, ctx)
    const newKnowledge = []
    const updatedKnowledge = []
    const newDecisions = []
    const supersededItems = []

    for (const cand of candidates) {
      const existing = this.store.list({ type: cand.type, topic: cand.topic, status: ['active', 'temporary', 'uncertain'] })
      const closest = this._findClosest(existing, cand.content)
      const added = this._resolveAndAdd(cand, closest, {
        newKnowledge, updatedKnowledge, newDecisions, supersededItems,
      })
      if (added && project) {
        this.store.update(added.id, { projects: [...new Set([...(added.projects ?? []), project])] })
      }
    }

    this._resolveQuestions(newKnowledge)
    this._resolveTasks(messages)

    const openQuestions = this.store.list({ type: 'question', status: 'active' })
    const pendingTasks = this.store.list({ type: 'task', status: 'active' })

    return {
      session_id: sessionId,
      extractor_used: extractor,
      summary: buildSummary(sessionId, {
        newKnowledge,
        updated: updatedKnowledge,
        superseded: supersededItems,
        decisions: newDecisions,
        openQuestions,
        pendingTasks,
      }),
      new_knowledge: newKnowledge.map(mini),
      updated_knowledge: updatedKnowledge,
      new_decisions: newDecisions.map(mini),
      superseded_items: supersededItems,
      open_questions: openQuestions.map(mini),
      pending_tasks: pendingTasks.map(mini),
    }
  }

  _findClosest(existing, content) {
    let best = null
    let bestSim = 0
    for (const e of existing) {
      const sim = similarity(e.content, content)
      if (sim > bestSim) {
        bestSim = sim
        best = e
      }
    }
    return best ? { entry: best, sim: bestSim } : null
  }

  /**
   * Resolve one candidate against the closest same-type/same-topic entry:
   *  - identical (sim ≥ 0.8)        → verify (bump last_verified)
   *  - stable topic, differs        → supersede / uncertain (confidence rules)
   *  - otherwise                    → plain add
   */
  _resolveAndAdd(cand, closest, state) {
    const { newKnowledge, updatedKnowledge, newDecisions, supersededItems } = state

    if (closest) {
      const { entry: best, sim } = closest

      if (sim >= 0.8) {
        this.store.update(best.id, {})
        updatedKnowledge.push({ id: best.id, type: best.type, content: best.content, action: 'verified', sensitive: best.sensitive })
        return null
      }

      // `best` is always the same type as `cand` (store.list filters by type),
      // so only the candidate's type membership matters here.
      const canSupersede =
        cand.topicStable &&
        SUPERSEDE_TYPES.has(cand.type) &&
        best.status !== 'uncertain'

      if (canSupersede) {
        if (cand.confidence >= 0.7 && cand.confidence >= best.confidence) {
          const added = this.store.supersede(best.id, cand)
          supersededItems.push({
            id: best.id,
            content: best.content,
            status: 'superseded',
            superseded_by: added.id,
            replaced_by_content: added.content,
            sensitive: best.sensitive,
          })
          newKnowledge.push(added)
          if (cand.type === 'decision') newDecisions.push(added)
          return added
        }
        if (cand.confidence < 0.5) {
          const added = this.store.add({ ...cand, status: 'uncertain' })
          newKnowledge.push(added)
          return added
        }
      }

      // Balanced confidence or non-supersedeable types → keep both, but do not
      // let a weaker claim masquerade as a strong one.
      const added = this.store.add(cand.confidence < 0.7 ? { ...cand, status: 'uncertain' } : cand)
      newKnowledge.push(added)
      if (cand.type === 'decision') newDecisions.push(added)
      return added
    }

    const added = this.store.add(cand)
    newKnowledge.push(added)
    if (cand.type === 'decision') newDecisions.push(added)
    return added
  }

  /**
   * Can `cand` plausibly answer question `q`?
   *  - same topic (single-truth domains resolve naturally), OR
   *  - strong keyword overlap (≥2 shared significant tokens) for cross-topic
   *    cases — e.g. “API bind di 127.0.0.1” (topic deployment) answering a
   *    question on topic api.
   * Resolving a question is low-stakes (just marks it done), so the confidence
   * bar (0.5) is lower than for superseding (0.7) — a plain fact (0.6) is a
   * valid answer.
   */
  _answersQuestion(q, cand) {
    if (!cand || cand.type === 'question' || cand.type === 'speculation') return false
    if ((cand.confidence ?? 0) < 0.5) return false
    if (cand.topic === q.topic) return true
    const qKeys = new Set(q.keywords ?? [])
    const overlap = (cand.keywords ?? []).filter(k => qKeys.has(k)).length
    return overlap >= 2
  }

  /** Mark open questions resolved when a plausible answer exists (this session or already in the store). */
  _resolveQuestions(newKnowledge) {
    const open = this.store.list({ type: 'question', status: 'active' })
    for (const q of open) {
      const local = newKnowledge.find(k => this._answersQuestion(q, k))
      const existing = this.store.list({ status: 'active' }).find(
        e => e.id !== q.id && this._answersQuestion(q, e),
      )
      const answer = local || existing
      if (answer) {
        this.store.update(q.id, { status: 'done', meta: { ...q.meta, resolved_by: answer.id } })
      }
    }
  }

  /** Mark pending tasks done when completion signals mention their keywords. */
  _resolveTasks(messages) {
    const pending = this.store.list({ type: 'task', status: 'active' })
    if (!pending.length) return
    const joined = messages.map(m => m.content).join(' ').toLowerCase()
    const completed = /\b(sudah selesai|selesai|done|fixed|beres|selesai dikerjakan|sudah dikerjakan|tuntas)\b/i.test(joined)
    if (!completed) return
    for (const task of pending) {
      const mentions = task.keywords.some(k => joined.includes(k.toLowerCase()))
      if (mentions) this.store.update(task.id, { status: 'done' })
    }
  }

  /**
   * Token-optimization maintenance: deprecate low-value entries that have not
   * been re-verified recently. High-stakes types (decisions/constraints/goals)
   * are kept regardless — they stay in context until explicitly superseded.
   * @returns {number} count of deprecated entries
   */
  deprecateObsolete({ maxAgeDays = 90, minImportance = 2 } = {}) {
    const cutoff = this.now() - maxAgeDays * 24 * 3600 * 1000
    const protectedTypes = new Set(['decision', 'constraint', 'goal', 'project'])
    const candidates = this.store.list({ status: 'active' })
    let deprecated = 0
    for (const e of candidates) {
      if (protectedTypes.has(e.type)) continue
      if (e.importance > minImportance) continue
      const verified = new Date(e.last_verified || e.created_at).getTime()
      if (!Number.isFinite(verified) || verified >= cutoff) continue
      this.store.update(e.id, {
        status: 'deprecated',
        meta: { ...e.meta, deprecated_by: 'maintenance', deprecated_at: new Date(this.now()).toISOString() },
      })
      deprecated++
    }
    return deprecated
  }
}
