// ── Public API ────────────────────────────────────────────
// One entry point wiring store + extractor + compiler + sessions + builder.

import path from 'node:path'
import { FileContextStore } from './store/fileStore.js'
import { MemoryContextStore } from './store/store.js'
import { Compiler } from './compiler/compiler.js'
import { ContextBuilder } from './builder/builder.js'
import { SessionManager } from './session/session.js'
import { writeMarkdown, updateManifest } from './render/output.js'
import { extractTopic } from './compiler/topics.js'
import { extractCandidates, classifyUtterance, splitUtterances, RuleExtractor } from './compiler/extract.js'
import { LlmExtractor, createExtractor, validateExtraction, EXTRACTION_SCHEMA, SYSTEM_PROMPT } from './compiler/llm.js'
import { scoreEntry, searchEntries, rankRelevant } from './retrieval/relevance.js'
import { resolveLayerBudgets, LAYER_BUDGETS } from './config.js'

export {
  FileContextStore,
  MemoryContextStore,
  Compiler,
  ContextBuilder,
  SessionManager,
  writeMarkdown,
  updateManifest,
  extractTopic,
  extractCandidates,
  classifyUtterance,
  splitUtterances,
  RuleExtractor,
  LlmExtractor,
  createExtractor,
  validateExtraction,
  EXTRACTION_SCHEMA,
  SYSTEM_PROMPT,
  scoreEntry,
  searchEntries,
  rankRelevant,
  resolveLayerBudgets,
  LAYER_BUDGETS,
}
export { ENTRY_TYPES, ENTRY_STATUSES, SUPERSEDE_TYPES, ContextStore } from './store/store.js'
export { estimateTokens, LAYER_NAMES } from './builder/builder.js'

/**
 * Create a fully wired context system rooted at `dir` (default `.ai`).
 *
 * Extraction: `createExtractor({ env })` — LlmExtractor (Claude) bila
 * ANTHROPIC_API_KEY tersedia, RuleExtractor (deterministik) sebagai fallback.
 * Compiler otomatis memakai rule-based fallback bila panggilan LLM gagal.
 */
export function createSystem({
  dir = '.ai',
  file = null,
  now = () => Date.now(),
  env = null,
  extractor = null,
  budgets = {},
} = {}) {
  const root = dir
  const envObj = env ?? (typeof process !== 'undefined' ? process.env : {})
  const manifestFile = path.join(root, 'manifest.json')
  const store = new FileContextStore({
    file: file ?? path.join(root, 'knowledge', 'knowledge.jsonl'),
    manifestFile,
    now,
  })
  const compiler = new Compiler({
    store,
    now,
    extractor: extractor ?? createExtractor({ env: envObj, now }),
  })
  const sessionsDir = path.join(root, 'sessions')
  const sessions = new SessionManager({ store, dir: root, now, compiler })
  const builder = new ContextBuilder({ store, sessionsDir, now, budgets, env: envObj })
  return {
    dir: root,
    store,
    compiler,
    sessions,
    builder,
    /** Regenerate human-readable markdown + manifest. */
    refreshOutput() {
      writeMarkdown({ store, dir: root, now })
      return updateManifest({ dir: root, store, now })
    },
    /** Token-optimization maintenance: deprecate stale low-value entries. */
    deprecateObsolete(opts) {
      const count = compiler.deprecateObsolete(opts)
      this.refreshOutput()
      return count
    },
  }
}
