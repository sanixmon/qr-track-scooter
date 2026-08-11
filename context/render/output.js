// ── Human-readable output ─────────────────────────────────
// Markdown is a compiled representation, NOT the source of truth
// (that is knowledge.jsonl). Regenerated on every compile/maintenance run.
//
// PRIVACY: item dengan `sensitive: true` TIDAK pernah dirender ke markdown —
// hanya tersimpan di structured store (diredaksi pada tampilan).

import fs from 'node:fs'
import path from 'node:path'

function visible(entries) {
  return entries.filter(e => !e.sensitive)
}

function bullets(entries, opts = {}) {
  const list = opts.includeSensitive ? entries : visible(entries)
  if (!list.length) return '_(belum ada)_\n'
  const includeStatus = opts.includeStatus ?? false
  return list
    .map(e => {
      const status = includeStatus && e.status !== 'active' ? ` — *${e.status}*` : ''
      return `- ${e.content} ${e.id}${status}`
    })
    .join('\n') + '\n'
}

function section(title, body) {
  return `## ${title}\n\n${body}\n`
}

function writeFile(dir, name, content) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, name), content, 'utf8')
}

/** Regenerate .ai/context/*.md from the store (sensitive items redacted). */
export function writeMarkdown({ store, dir, now = () => Date.now() }) {
  const ctxDir = path.join(dir, 'context')
  fs.mkdirSync(ctxDir, { recursive: true })
  const s = store

  const core = [
    section('Goals', bullets(s.list({ type: 'goal', status: 'active' }).filter(e => e.importance >= 3))),
    section('User Preferences', bullets(s.list({ type: 'preference', status: 'active' }).filter(e => e.importance >= 3))),
    section('Important Assumptions', bullets(s.list({ type: 'assumption', status: 'active' }).filter(e => e.importance >= 3))),
    section('Open Questions', bullets(s.list({ type: 'question', status: 'active' }))),
    section('Lessons Learned', bullets(s.list({ type: 'lesson', status: 'active' }))),
    section('Key Facts', bullets(s.list({ type: 'fact', status: 'active' }).filter(e => e.importance >= 4))),
  ].join('\n')
  writeFile(ctxDir, 'core.md', `# Core Context\n\n_Compiled ${new Date(now()).toISOString()}_\n\n${core}`)

  writeFile(ctxDir, 'project.md', `# Project Information\n\n${bullets(s.list({ type: 'project', status: 'active' }))}`)

  const decisions = s.list({ type: 'decision', status: 'active' })
  const superseded = s.list({ type: 'decision', status: 'superseded' })
    .filter(d => d.superseded_by)
    .filter(d => !d.sensitive) // privacy: redaksi item sensitive
  let decisionsBody = bullets(decisions)
  if (superseded.length) {
    decisionsBody += '\n### Superseded trail\n\n' + superseded
      .map(d => `- ~~${d.content}~~ (${d.id}) → ${d.superseded_by}`)
      .join('\n') + '\n'
  }
  writeFile(ctxDir, 'decisions.md', `# Decisions\n\n${decisionsBody}`)

  writeFile(ctxDir, 'constraints.md', `# Constraints\n\n${bullets(s.list({ type: 'constraint', status: 'active' }))}`)

  const states = s.list({ type: 'state', status: 'active' })
  const tasks = s.list({ type: 'task', status: 'active' })
  const stateBody = `${section('Current State', bullets(states))}${section('Pending Tasks', bullets(tasks))}`
  writeFile(ctxDir, 'current-state.md', `# Current State\n\n${stateBody}`)

  writeFile(ctxDir, 'glossary.md', `# Glossary\n\n${bullets(s.list({ type: 'term', status: 'active' }))}`)

  return { dir: ctxDir, files: ['core.md', 'project.md', 'decisions.md', 'constraints.md', 'current-state.md', 'glossary.md'] }
}

/** Write a session snapshot as human-readable markdown (sensitive redacted). */
export function writeSessionMarkdown(snapshot, dir, now = () => Date.now()) {
  const sessionsDir = path.join(dir, 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })
  const redact = items => (items ?? []).filter(m => !m.sensitive)
  const lines = []
  const redactList = items => (items ?? []).filter(i => !i.sensitive)
  lines.push(`# Session ${snapshot.session_id}`)
  lines.push('')
  lines.push(`summary: ${snapshot.summary}`)
  lines.push(`extractor_used: ${snapshot.extractor_used ?? 'n/a'}`)
  lines.push(`compiled_at: ${new Date(now()).toISOString()}`)
  lines.push('')
  lines.push('## New Knowledge')
  lines.push(bullets(redact(snapshot.new_knowledge).map(miniToBullet)))
  lines.push('## Updated / Verified')
  lines.push(bullets(redactList(snapshot.updated_knowledge).map(u => `- ${u.content} (${u.id}) — ${u.action}`)))
  lines.push('## New Decisions')
  lines.push(bullets(redact(snapshot.new_decisions).map(miniToBullet)))
  lines.push('## Superseded')
  lines.push(bullets(redactList(snapshot.superseded_items).map(su => `- ~~${su.content}~~ (${su.id}) → ${su.superseded_by}`)))
  lines.push('## Open Questions')
  lines.push(bullets(redact(snapshot.open_questions).map(miniToBullet)))
  lines.push('## Pending Tasks')
  lines.push(bullets(redact(snapshot.pending_tasks).map(miniToBullet)))
  writeFile(sessionsDir, `${snapshot.session_id}.md`, lines.join('\n'))
  return path.join(sessionsDir, `${snapshot.session_id}.md`)
}

function miniToBullet(m) {
  return `- ${m.content} (${m.id}, ${m.type})`
}

/** Update manifest.json with stats + id_counters (preserved from existing). */
export function updateManifest({ dir, store, lastSession = null, now = () => Date.now() }) {
  const manifestPath = path.join(dir, 'manifest.json')
  let manifest = {}
  if (fs.existsSync(manifestPath)) {
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) } catch { manifest = {} }
  }
  const snap = store.snapshot()
  const iso = new Date(now()).toISOString()
  manifest = {
    format_version: 2,
    created_at: manifest.created_at ?? iso,
    updated_at: iso,
    last_session: lastSession ?? manifest.last_session ?? null,
    // ID counters are owned by the store (FileContextStore) — never clobber.
    id_counters: manifest.id_counters ?? {},
    stats: snap.stats,
    layers: {
      l0: ['core.md'],
      l1: ['project.md'],
      l2: ['decisions.md', 'constraints.md'],
      l3: ['current-state.md'],
      l4: ['glossary.md', 'sessions/*.md'],
    },
  }
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  return manifest
}
