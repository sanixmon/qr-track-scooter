// ── LLM-based extractor (Claude API) ──────────────────────
// Extract → Classify → Validate dijalankan lewat LLM karena membedakan
// FACT vs ASSUMPTION vs SPECULATION butuh reasoning. Semua pemanggilan LLM
// diisolasi di file ini:
//   - prompt template eksplisit (SYSTEM_PROMPT),
//   - output WAJIB JSON terstruktur yang divalidasi (validateExtraction),
//   - `client`/`fetchImpl` bisa di-mock untuk testing,
//   - `RuleExtractor` (compiler/extract.js) jadi fallback deterministik
//     ketika API key tidak tersedia atau panggilan LLM gagal.

import { extractTopic } from './topics.js'
import { keywordTokens } from '../shared/normalize.js'
import { RuleExtractor } from './extract.js'

export const LLM_TYPES = [
  'fact', 'decision', 'preference', 'project', 'constraint', 'state',
  'goal', 'term', 'assumption', 'question', 'task', 'lesson', 'speculation',
]

export const LLM_STATUSES = ['active', 'temporary', 'uncertain', 'superseded', 'deprecated', 'done']

// ── JSON schema (validated, bukan free text) ──────────────
export const EXTRACTION_SCHEMA = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'content', 'confidence'],
        properties: {
          type: { type: 'string', enum: LLM_TYPES },
          content: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          importance: { type: 'number', minimum: 1, maximum: 5 },
          status: { type: 'string', enum: LLM_STATUSES },
          sensitive: { type: 'boolean' },
          topic: { type: 'string' },
          keywords: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

// ── Prompt template (eksplisit, di sini saja) ─────────────
export const SYSTEM_PROMPT = `You are a context compiler. From the conversation below, extract durable
knowledge items for a persistent AI context store. Classify each utterance into EXACTLY one type:
fact, decision, preference, project, constraint, state, goal, term, assumption, question, task, lesson, speculation.

Rules:
- Do NOT treat every statement as fact. Speculation ("maybe", "mungkin") → type "speculation", low confidence.
- Questions from the user → type "question". Ignore assistant clarifications.
- Directives from the user ("tolong buat", "fix", "please add") → type "task".
- Confidence 0..1: 0.9+ for explicit decisions/constraints, 0.6-0.7 for plain facts, <0.5 for speculation/assumption.
- Importance 1..5: decisions/constraints/goals ≥ 4.
- status: "active" normally; "temporary" for current-state/speculation; "uncertain" when conflicting evidence.
- sensitive: true ONLY for credentials, API keys, passwords, internal URLs, secrets.
- topic: short canonical noun phrase for the subject (e.g. "database", "framework", "deployment").
- keywords: 1-6 lowercase searchable keywords.
- Return ONLY valid JSON matching this schema (no prose, no markdown fences):
${JSON.stringify(EXTRACTION_SCHEMA, null, 2)}`

function buildTranscript(messages) {
  return messages
    .filter(m => m && m.role !== 'system' && m.content)
    .map(m => `[${m.role}] ${m.content}`)
    .join('\n')
}

/** Parse + validate the LLM's JSON response into raw candidates. */
export function validateExtraction(rawText) {
  let parsed
  try {
    // Strip code fences if the model wrapped the JSON.
    const cleaned = String(rawText)
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()
    parsed = JSON.parse(cleaned)
  } catch (err) {
    throw new Error(`LLM extractor returned invalid JSON: ${err.message}`, { cause: err })
  }
  if (!parsed || !Array.isArray(parsed.items)) {
    throw new Error('LLM extractor response missing "items" array')
  }
  const out = []
  for (const [i, item] of parsed.items.entries()) {
    if (!item || typeof item !== 'object') throw new Error(`items[${i}] is not an object`)
    if (!LLM_TYPES.includes(item.type)) throw new Error(`items[${i}].type invalid: "${item.type}"`)
    if (typeof item.content !== 'string' || !item.content.trim()) throw new Error(`items[${i}].content required`)
    const conf = Number(item.confidence)
    if (!Number.isFinite(conf) || conf < 0 || conf > 1) throw new Error(`items[${i}].confidence invalid`)
    if (item.status && !LLM_STATUSES.includes(item.status)) throw new Error(`items[${i}].status invalid`)
    out.push({
      type: item.type,
      content: item.content.trim(),
      confidence: conf,
      importance: item.importance == null ? 2 : Math.min(5, Math.max(1, Math.round(Number(item.importance)))),
      status: item.status ?? 'active',
      sensitive: Boolean(item.sensitive),
      topic: item.topic ?? '',
      // Stability is derived from the (topic | content) string via the same
      // category table the rule extractor uses — otherwise contradiction
      // resolution would never fire on the LLM path (single-truth domains).
      topicStable: extractTopic(item.topic || item.content).stable,
      keywords: Array.isArray(item.keywords) && item.keywords.length
        ? item.keywords.map(k => String(k).toLowerCase()).slice(0, 6)
        : keywordTokens(item.content),
      meta: {},
    })
  }
  return out
}

/**
 * Claude-compatible extractor. Calls the Anthropic Messages API.
 * `fetchImpl` is injectable so tests can mock the network call.
 */
export class LlmExtractor {
  constructor({
    apiKey = null,
    baseUrl = 'https://api.anthropic.com',
    model = 'claude-sonnet-4-5',
    fetchImpl = null,
    now = () => Date.now(),
  } = {}) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || null
    this.baseUrl = baseUrl || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
    this.model = model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5'
    this.fetchImpl = fetchImpl || globalThis.fetch
    this.now = now
    this.kind = 'llm'
    if (!this.fetchImpl) throw new Error('LlmExtractor requires a fetch implementation (Node >= 18)')
  }

  async extract(messages, { sourceSession = null, now = this.now } = {}) {
    if (!this.apiKey) throw new Error('ANTHROPIC_API_KEY is not set')

    const transcript = buildTranscript(messages)
    if (!transcript) return []

    const res = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: transcript }],
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`LLM API error ${res.status}: ${body.slice(0, 200)}`)
    }

    const data = await res.json()
    const text = data?.content?.map(c => c.text ?? '').join('') ?? ''
    if (!text) throw new Error('LLM extractor returned empty content')

    const ts = new Date(now()).toISOString()
    return validateExtraction(text).map(c => ({
      ...c,
      topic: c.topic || extractTopic(c.content).topic,
      source_session: sourceSession,
      created_at: ts,
      last_verified: ts,
    }))
  }
}

/**
 * Factory: pilih extractor berdasarkan environment.
 * - ANTHROPIC_API_KEY tersedia  → LlmExtractor (default production)
 * - tidak ada                  → RuleExtractor (fallback deterministik, testable)
 */
export function createExtractor({ env = process.env, now = () => Date.now(), fetchImpl = null } = {}) {
  if (env.ANTHROPIC_API_KEY) {
    return new LlmExtractor({ apiKey: env.ANTHROPIC_API_KEY, baseUrl: env.ANTHROPIC_BASE_URL, model: env.ANTHROPIC_MODEL, fetchImpl, now })
  }
  return new RuleExtractor({ now })
}
