import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import { createSystem } from '../index.js'
import { fixedClock, tempDir, rmDir, readFileOr } from './helpers.js'

const dirs = []
afterEach(() => {
  while (dirs.length) rmDir(dirs.pop())
})

function setup() {
  const dir = tempDir()
  dirs.push(dir)
  const system = createSystem({ dir, now: fixedClock() })
  return { dir, system }
}

describe('SessionManager + createSystem', () => {
  it('full lifecycle: create → messages → compile → persistent files', async () => {
    const { dir, system } = setup()
    const s1 = system.sessions.createSession()
    expect(s1.session_id).toBe('session-001')
    system.sessions.addMessage('session-001', 'user', 'Kita pakai PostgreSQL untuk database')
    system.sessions.addMessage('session-001', 'assistant', 'Siap, dicatat.')

    const snapshot = await system.sessions.compileSession('session-001')
    expect(snapshot.session_id).toBe('session-001')
    expect(snapshot.new_decisions).toHaveLength(1)

    // knowledge.jsonl = source of truth
    const raw = readFileOr(`${dir}/knowledge`, 'knowledge.jsonl')
    expect(raw).toContain('PostgreSQL')

    // session markdown snapshot
    const sessionMd = readFileOr(`${dir}/sessions`, 'session-001.md')
    expect(sessionMd).toContain('# Session session-001')
    expect(sessionMd).toContain('summary:')

    // compiled context markdown
    expect(readFileOr(`${dir}/context`, 'decisions.md')).toContain('PostgreSQL')
    expect(readFileOr(`${dir}/context`, 'core.md')).toContain('# Core Context')

    // manifest
    const manifest = JSON.parse(readFileOr(dir, 'manifest.json'))
    expect(manifest.last_session).toBe('session-001')
    expect(manifest.stats.by_type.decision).toBe(1)
    expect(manifest.stats.total).toBe(2) // 1 decision + 1 fact from assistant reply
  })

  it('persists raw messages and restores them', async () => {
    const { system } = setup()
    system.sessions.createSession()
    system.sessions.addMessage('session-001', 'user', 'Tolong buat dashboard')
    const loaded = system.sessions.getSession('session-001')
    expect(loaded.messages).toHaveLength(1)
    expect(loaded.messages[0].role).toBe('user')
  })

  it('invalid roles and unknown sessions are rejected', async () => {
    const { system } = setup()
    system.sessions.createSession()
    expect(() => system.sessions.addMessage('session-001', 'robot', 'x')).toThrow(/invalid role/)
    expect(() => system.sessions.addMessage('session-999', 'user', 'x')).toThrow(/unknown session/)
  })

  it('a second session supersedes the first and updates the manifest', async () => {
    const { system } = setup()
    system.sessions.createSession()
    system.sessions.addMessage('session-001', 'user', 'Kita pakai PostgreSQL untuk database')
    await system.sessions.compileSession('session-001')

    system.sessions.createSession()
    system.sessions.addMessage('session-002', 'user', 'Kita pakai SQLite untuk database')
    const snap = await system.sessions.compileSession('session-002')

    expect(snap.superseded_items).toHaveLength(1)
    const manifest = JSON.parse(readFileOr(system.dir, 'manifest.json'))
    expect(manifest.last_session).toBe('session-002')
    const decisions = readFileOr(`${system.dir}/context`, 'decisions.md')
    expect(decisions).toContain('SQLite')
    expect(decisions).toContain('PostgreSQL') // superseded trail retained
  })

  it('session ids stay unique even when raw files are deleted', () => {
    const { system } = setup()
    system.sessions.createSession()
    system.sessions.createSession()
    // Simulate a deleted raw file: count-based id would collide here.
    fs.unlinkSync(`${system.dir}/sessions/_raw-session-001.json`)
    const s3 = system.sessions.createSession()
    expect(s3.session_id).toBe('session-003')
    expect(system.sessions.getSession('session-002')).not.toBeNull()
    expect(system.sessions.getSession('session-003')).not.toBeNull()
  })

  it('createSystem wires store + builder + sessions', async () => {
    const { system } = setup()
    expect(system.store).toBeTruthy()
    expect(system.sessions).toBeTruthy()
    expect(system.builder).toBeTruthy()
    expect(system.dir).toBeTruthy()
    // store file created lazily on first mutation
    system.store.add({ type: 'fact', content: 'x y', importance: 2 })
    expect(fs.existsSync(`${system.dir}/knowledge/knowledge.jsonl`)).toBe(true)
  })
})
