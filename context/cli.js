#!/usr/bin/env node
// ── Context System CLI ────────────────────────────────────
// Usage:
//   node context/cli.js init [--dir .ai]
//   node context/cli.js status
//   node context/cli.js add "<content>" [--type decision] [--importance 4] [--topic X] [--sensitive]
//   node context/cli.js session-begin
//   node context/cli.js message <session> <role> "<content>"
//   node context/cli.js compile <session> [--project name]
//   node context/cli.js build "<request>" [--layers l0,l1,l2,l3] [--budget-l3 1500] [--include-sensitive]
//   node context/cli.js list [--type X] [--status Y] [--show-sensitive]
//   node context/cli.js supersede <id> "<new content>" [--type decision] [--topic X]
//   node context/cli.js sessions
//   node context/cli.js optimize [--max-age-days 90] [--min-importance 2]

import fs from 'node:fs'
import path from 'node:path'
import { createSystem } from './index.js'
import { ENTRY_TYPES } from './store/store.js'
import { extractTopic } from './compiler/topics.js'
import { LAYER_NAMES } from './builder/builder.js'

function parseArgs(argv) {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const val = argv[i + 1]
      flags[key] = val !== undefined && !val.startsWith('--') ? val : true
      if (flags[key] !== true) i++
    } else {
      positional.push(a)
    }
  }
  return { positional, flags }
}

function printHelp() {
  const usage = [
    'Usage: node context/cli.js <command> [args]',
    '',
    'Commands:',
    '  init [--dir .ai]                      create dirs + manifest',
    '  status                                store stats (type/status)',
    '  add "<content>" [--type decision] [--importance 4] [--topic X] [--sensitive]',
    '  session-begin                         create a new session',
    '  message <session> <role> "<content>"  append a message',
    '  compile <session> [--project name]    compile session → snapshot + markdown',
    '  build "<request>" [--layers l0,l1,l2,l3] [--budget-l3 1500] [--include-sensitive]',
    '  list [--type X] [--status Y] [--show-sensitive]',
    '  supersede <id> "<new content>" [--type decision] [--topic X]',
    '  sessions                              list sessions',
    '  optimize [--max-age-days 90] [--min-importance 2]',
  ]
  console.log(usage.join('\n'))
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2))
  const cmd = positional[0]

  if (!cmd || cmd === 'help' || cmd === '--help') {
    printHelp()
    process.exit(cmd ? 0 : 1)
  }

  const dir = flags.dir || '.ai'
  const system = createSystem({ dir })

  switch (cmd) {
    case 'init': {
      fs.mkdirSync(path.join(dir, 'knowledge'), { recursive: true })
      fs.mkdirSync(path.join(dir, 'context'), { recursive: true })
      fs.mkdirSync(path.join(dir, 'sessions'), { recursive: true })
      system.refreshOutput()
      console.log(`context system initialized at ${dir}/`)
      break
    }

    case 'status': {
      const snap = system.store.snapshot()
      console.log(`total entries: ${snap.stats.total}`)
      console.log(`by status: ${JSON.stringify(snap.stats.by_status)}`)
      console.log(`by type:   ${JSON.stringify(snap.stats.by_type)}`)
      console.log(`sensitive: ${system.store.list({ sensitive: true }).length}`)
      break
    }

    case 'add': {
      const content = positional[1]
      if (!content) { console.error('usage: add "<content>"'); process.exit(1) }
      const type = flags.type || 'fact'
      if (!ENTRY_TYPES.includes(type)) { console.error(`invalid type "${type}"`); process.exit(1) }
      const topic = flags.topic || extractTopic(content).topic
      const added = system.store.add({
        type,
        content,
        topic,
        importance: Number(flags.importance ?? 2),
        confidence: Number(flags.confidence ?? (type === 'fact' ? 0.6 : 0.85)),
        sensitive: flags.sensitive === true,
      })
      system.refreshOutput()
      console.log(`added ${added.id} (${type}, topic="${topic}", importance=${added.importance}${added.sensitive ? ', SENSITIVE' : ''})`)
      break
    }

    case 'session-begin': {
      const session = system.sessions.createSession()
      console.log(`session created: ${session.session_id}`)
      break
    }

    case 'message': {
      const [sessionId, role, ...rest] = positional.slice(1)
      if (!sessionId || !rest.length) { console.error('usage: message <session> <role> "<content>"'); process.exit(1) }
      system.sessions.addMessage(sessionId, role || 'user', rest.join(' '))
      console.log(`message appended to ${sessionId}`)
      break
    }

    case 'compile': {
      const sessionId = positional[1]
      if (!sessionId) { console.error('usage: compile <session> [--project name]'); process.exit(1) }
      const snapshot = await system.sessions.compileSession(sessionId, { project: flags.project || null })
      console.log('=== snapshot ===')
      console.log(snapshot.summary)
      console.log(`extractor: ${snapshot.extractor_used ?? 'n/a'}`)
      console.log(`new: ${snapshot.new_knowledge.length}, updated: ${snapshot.updated_knowledge.length}, superseded: ${snapshot.superseded_items.length}`)
      console.log(`markdown → ${dir}/context/*.md, ${dir}/sessions/${sessionId}.md`)
      break
    }

    case 'build': {
      const request = positional[1]
      if (!request) { console.error('usage: build "<request>"'); process.exit(1) }
      const layers = flags.layers ? flags.layers.split(',') : ['l0', 'l1', 'l2', 'l3']
      const budgets = {}
      for (const layer of LAYER_NAMES) {
        if (flags[`budget-${layer}`] != null) budgets[layer] = Number(flags[`budget-${layer}`])
      }
      const result = system.builder.build(request, {
        layers,
        budgets,
        maxTokens: flags['max-tokens'] != null ? Number(flags['max-tokens']) : null,
        includeSensitive: flags['include-sensitive'] === true,
      })
      console.log(result.text)
      console.log(`\n[layers: ${result.included.join(',') || '-'} | omitted: ${result.omitted.join(',') || '-'} | tokens: ${result.tokens} | per-layer: ${JSON.stringify(result.layerTokens)}]`)
      break
    }

    case 'list': {
      const entries = system.store.list({
        type: flags.type || null,
        status: flags.status || null,
      })
      for (const e of entries) {
        const status = e.status !== 'active' ? ` [${e.status}]` : ''
        const sensitive = e.sensitive ? ' [SENSITIVE]' : ''
        console.log(`${e.id}\t${e.type}\t${e.topic}\timp=${e.importance}\tconf=${e.confidence}${status}${sensitive}\t${e.content}`)
      }
      if (!entries.length) console.log('(no entries)')
      break
    }

    case 'supersede': {
      const [id, ...rest] = positional.slice(1)
      const content = rest.join(' ')
      if (!id || !content) { console.error('usage: supersede <id> "<new content>"'); process.exit(1) }
      const added = system.store.supersede(id, {
        type: flags.type || 'decision',
        content,
        topic: flags.topic || extractTopic(content).topic,
        importance: Number(flags.importance ?? 4),
        confidence: Number(flags.confidence ?? 0.9),
      })
      if (!added) { console.error(`unknown entry "${id}"`); process.exit(1) }
      system.refreshOutput()
      console.log(`${id} superseded by ${added.id}`)
      break
    }

    case 'sessions': {
      const sessions = system.sessions.listSessions()
      for (const s of sessions) {
        console.log(`${s.session_id}\tmessages=${s.messages}\tcompiled=${s.compiled}`)
      }
      if (!sessions.length) console.log('(no sessions)')
      break
    }

    case 'optimize': {
      const count = system.deprecateObsolete({
        maxAgeDays: Number(flags['max-age-days'] ?? 90),
        minImportance: Number(flags['min-importance'] ?? 2),
      })
      console.log(`deprecated ${count} stale low-value entr${count === 1 ? 'y' : 'ies'}`)
      break
    }

    default:
      console.error(`unknown command "${cmd}"`)
      printHelp()
      process.exit(1)
  }
}

main().catch(err => {
  console.error('error:', err.message)
  process.exit(1)
})
