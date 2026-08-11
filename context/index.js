// ── Public API ────────────────────────────────────────────
// One entry point wiring store + compiler + sessions + builder + output.

import path from 'node:path'
import { FileContextStore } from './lib/fileStore.js'
import { MemoryContextStore } from './lib/store.js'
import { Compiler } from './lib/compiler.js'
import { ContextBuilder } from './lib/builder.js'
import { SessionManager } from './lib/session.js'
import { writeMarkdown, updateManifest } from './lib/output.js'
import { extractTopic } from './lib/topics.js'
import { extractCandidates, classifyUtterance, splitUtterances } from './lib/extractor.js'
import { scoreEntry, searchEntries, rankRelevant } from './lib/relevance.js'

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
  scoreEntry,
  searchEntries,
  rankRelevant,
}
export { ENTRY_TYPES, ENTRY_STATUSES, SUPERSEDE_TYPES, ContextStore } from './lib/store.js'
export { estimateTokens, LAYER_NAMES } from './lib/builder.js'

/**
 * Create a fully wired context system rooted at `dir` (default `.ai`).
 * - store: FileContextStore persisted to `<dir>/knowledge/knowledge.jsonl`
 * - sessionsDir: `<dir>/sessions`
 */
export function createSystem({ dir = '.ai', file = null, now = () => Date.now() } = {}) {
  const root = dir
  const store = new FileContextStore({ file: file ?? path.join(root, 'knowledge', 'knowledge.jsonl'), now })
  const compiler = new Compiler({ store, now })
  const sessionsDir = path.join(root, 'sessions')
  const sessions = new SessionManager({ store, dir: root, now, compiler })
  const builder = new ContextBuilder({ store, sessionsDir, now })
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
