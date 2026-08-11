// ── Topic extraction ──────────────────────────────────────
// Topics are the "address" used for dedup & contradiction resolution.
// `stable: true` marks single-truth domains (database, framework, …) where two
// active claims on the same topic are treated as a contradiction. Open-ended
// facts fall back to an unstable topic and simply coexist.

import { normalizeText, tokenize } from './normalize.js'

// Domain categories — first match wins. Keys are lowercase; multi-word keys
// matched as substrings with word boundaries.
const CATEGORIES = [
  { topic: 'database', keys: ['postgres', 'postgresql', 'sqlite', 'mysql', 'mariadb', 'mongodb', 'database', 'redis'] },
  { topic: 'framework', keys: ['express', 'fastify', 'nestjs', 'nest', 'fastapi', 'flask', 'django', 'framework'] },
  { topic: 'frontend', keys: ['react', 'vue', 'svelte', 'angular', 'frontend', 'front-end', 'front end'] },
  { topic: 'authentication', keys: ['jwt', 'oauth', 'authentication', 'auth', 'login', 'session-auth'] },
  { topic: 'deployment', keys: ['pm2', 'nginx', 'docker', 'deploy', 'deployment', 'hosting', 'vps', 'certbot', 'https', 'ssl', 'server'] },
  { topic: 'storage', keys: ['localstorage', 'local-storage', 'indexeddb', 'json', 'jsonl'] },
  { topic: 'api', keys: ['api', 'rest', 'graphql', 'endpoint', 'endpoints'] },
  { topic: 'ui', keys: ['ui', 'ux', 'design', 'interface', 'halaman', 'page', 'modal', 'komponen', 'component'] },
  { topic: 'testing', keys: ['test', 'testing', 'vitest', 'jest', 'unit-test', 'lint'] },
  { topic: 'database-migration', keys: ['migrasi', 'migration', 'migrate'] },
  { topic: 'security', keys: ['security', 'keamanan', 'cors', 'rate-limit', 'validasi', 'validation'] },
  { topic: 'maintenance', keys: ['maintenance', 'perawatan', 'rusak', 'repair'] },
]

function containsKeyWord(text, key) {
  return (
    text === key ||
    text.startsWith(`${key} `) ||
    text.endsWith(` ${key}`) ||
    text.includes(` ${key} `) ||
    text.includes(`${key} untuk `) ||
    text.includes(`${key} sebagai `) ||
    text.includes(`${key} is `)
  )
}

/**
 * @param {string} content
 * @returns {{ topic: string, stable: boolean }}
 */
export function extractTopic(content) {
  const text = String(content ?? '').toLowerCase()

  // 1) Domain category table → stable.
  const tokens = new Set(tokenize(text))
  for (const cat of CATEGORIES) {
    for (const key of cat.keys) {
      if (tokens.has(key) || containsKeyWord(text, key)) {
        return { topic: cat.topic, stable: true }
      }
    }
  }

  // 2) Purpose pattern "... untuk/for X" → stable topic from the purpose.
  const purpose = text.match(/(?:untuk|for|sebagai|as)\s+([a-z0-9][a-z0-9\s-]{1,60})[.!?]?$/)
  if (purpose) {
    const t = normalizeText(purpose[1])
    if (t) return { topic: t.split(' ').slice(0, 4).join('-'), stable: true }
  }

  // 3) Fallback: normalized content (unstable, coexisting).
  const norm = normalizeText(text)
  if (!norm) return { topic: 'general', stable: false }
  return { topic: norm.split(' ').slice(0, 4).sort().join('-'), stable: false }
}
