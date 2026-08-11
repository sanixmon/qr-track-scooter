// ── Session Manager ───────────────────────────────────────
// Lifecycle: beginSession → recordMessage(s) → compileSession → snapshot.
// Raw conversations persist as JSON (L5 fallback); compiled snapshots as
// human-readable markdown under .ai/sessions/.

import fs from 'node:fs'
import path from 'node:path'
import { Compiler } from '../compiler/compiler.js'
import { updateManifest, writeSessionMarkdown, writeMarkdown } from '../render/output.js'

export class SessionManager {
  /**
   * @param {{ store: object, dir?: string, now?: () => number, compiler?: Compiler }} opts
   */
  constructor({ store, dir, now = () => Date.now(), compiler = null } = {}) {
    if (!store) throw new Error('SessionManager requires { store }')
    this.store = store
    this.dir = dir ?? '.ai'
    this.now = now
    this.compiler = compiler ?? new Compiler({ store, now })
    this._sessionsDir = path.join(this.dir, 'sessions')
  }

  _rawPath(id) {
    return path.join(this._sessionsDir, `_raw-${id}.json`)
  }

  _readRaw(id) {
    const p = this._rawPath(id)
    if (!fs.existsSync(p)) return null
    try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null }
  }

  _writeRaw(session) {
    fs.mkdirSync(this._sessionsDir, { recursive: true })
    fs.writeFileSync(this._rawPath(session.session_id), JSON.stringify(session, null, 2), 'utf8')
  }

  /** Create a new session. Returns the session object. */
  createSession(id = null) {
    // Derive from the highest existing session number (not the count) so ids
    // stay unique even when raw files are deleted or drift.
    const maxNum = this.listSessions().reduce((m, s) => {
      const n = /^session-(\d+)$/.exec(s.session_id)
      return n ? Math.max(m, Number(n[1])) : m
    }, 0)
    const session = {
      session_id: id ?? `session-${String(maxNum + 1).padStart(3, '0')}`,
      started_at: new Date(this.now()).toISOString(),
      messages: [],
      compiled: false,
      compiled_at: null,
    }
    this._writeRaw(session)
    return session
  }

  /** Load a session (raw) by id, or null. */
  getSession(id) {
    return this._readRaw(id)
  }

  listSessions() {
    if (!fs.existsSync(this._sessionsDir)) return []
    return fs.readdirSync(this._sessionsDir)
      .filter(f => /^_raw-session-.*\.json$/.test(f))
      .map(f => {
        try {
          const s = JSON.parse(fs.readFileSync(path.join(this._sessionsDir, f), 'utf8'))
          return { session_id: s.session_id, started_at: s.started_at, messages: s.messages?.length ?? 0, compiled: s.compiled }
        } catch {
          return null
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.session_id.localeCompare(b.session_id))
  }

  /** Append a message to a session. */
  addMessage(id, role, content) {
    const session = this._readRaw(id)
    if (!session) throw new Error(`unknown session "${id}"`)
    if (!['user', 'assistant', 'system'].includes(role)) throw new Error(`invalid role "${role}"`)
    session.messages.push({ role, content: String(content), ts: new Date(this.now()).toISOString() })
    this._writeRaw(session)
    return session
  }

  /**
   * Compile a session's conversation into the persistent store.
   * @returns {Promise<object>} snapshot
   */
  async compileSession(id, { project = null } = {}) {
    const session = this._readRaw(id)
    if (!session) throw new Error(`unknown session "${id}"`)
    const snapshot = await this.compiler.compile({
      sessionId: id,
      messages: session.messages,
      project,
    })
    session.compiled = true
    session.compiled_at = new Date(this.now()).toISOString()
    this._writeRaw(session)
    writeSessionMarkdown(snapshot, this.dir, this.now)
    writeMarkdown({ store: this.store, dir: this.dir, now: this.now })
    updateManifest({ dir: this.dir, store: this.store, lastSession: id, now: this.now })
    return snapshot
  }

  /** Raw messages of a session (for L5 fallback). */
  rawMessages(id) {
    const session = this._readRaw(id)
    return session ? session.messages : []
  }
}
