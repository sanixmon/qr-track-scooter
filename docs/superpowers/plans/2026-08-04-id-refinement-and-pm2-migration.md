# Implementation Plan: Scooter ID Refinement, Pure Online DB Backend & PM2 Deployment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine scooter IDs from padded strings (`SD-001`) to unpadded integers (`SD-1`, `SD-2`), auto-migrate existing SQLite records, enforce 100% online REST API operation with zero offline/localStorage fallbacks, and deploy the Express API backend using PM2.

**Architecture:** Express.js REST API backed by SQLite (`better-sqlite3`) for multi-device live data management. React 19 frontend calls the REST API strictly via async `fetch` with no local storage fallback. PM2 manages the Node API server as a background daemon process.

**Tech Stack:** Node.js, Express v5, SQLite (`better-sqlite3`), React 19, Vite, Vitest, PM2.

## Global Constraints

- **ID Formatting:** `SD-1`, `SD-2`, `SJ-1` (no zero-padding like `001`).
- **Database:** Direct SQLite file (`server/trackscooter.db`).
- **Storage Mode:** 100% Online REST API, no offline localStorage layer.
- **Process Manager:** PM2 with `ecosystem.config.cjs`.

---

### Task 1: Database Migration & Scooter ID Unpadding in Server Logic

**Files:**
- Modify: `server/server.js:25-55`
- Modify: `server/db.js:19-35`
- Test: `server/api.test.js`

**Interfaces:**
- Consumes: SQLite `scooters` and `activity_log` tables
- Produces: Unpadded IDs (`SD-1`, `SJ-2`) for all GET/POST responses and DB rows.

- [ ] **Step 1: Write database migration helper in server/db.js**

Add inline migration function in `server/db.js` that updates existing zero-padded records:
```javascript
function migrateUnpaddedIds(db) {
  const scooters = db.prepare("SELECT id FROM scooters WHERE id LIKE '%-0%'").all()
  if (scooters.length === 0) return

  const updateScooter = db.prepare("UPDATE scooters SET id = ? WHERE id = ?")
  const updateLog = db.prepare("UPDATE activity_log SET scooter_id = ? WHERE scooter_id = ?")

  const transaction = db.transaction((rows) => {
    for (const row of rows) {
      const parts = row.id.split('-')
      if (parts.length === 2) {
        const prefix = parts[0]
        const num = parseInt(parts[1], 10)
        if (!isNaN(num)) {
          const newId = `${prefix}-${num}`
          updateScooter.run(newId, row.id)
          updateLog.run(newId, row.id)
        }
      }
    }
  })

  transaction(scooters)
}
```

- [ ] **Step 2: Update ID generation logic in server/server.js**

In `server/server.js`, modify `POST /api/scooters`:
Replace `finalId = ${prefix}${String(next).padStart(3, '0')}` with:
`finalId = ${prefix}${next}`

And when parsing custom `id`:
```javascript
if (finalId) {
  if (!finalId.startsWith(prefix)) {
    const numericPart = finalId.replace(/\D/g, '')
    if (numericPart) {
      finalId = `${prefix}${parseInt(numericPart, 10)}`
    } else {
      finalId = `${prefix}${finalId}`
    }
  } else {
    const parts = finalId.split('-')
    if (parts.length === 2 && !isNaN(parseInt(parts[1], 10))) {
      finalId = `${parts[0]}-${parseInt(parts[1], 10)}`
    }
  }
}
```

- [ ] **Step 3: Run Vitest API tests to check ID unpadding**

Run: `pnpm test server/api.test.js`

- [ ] **Step 4: Update test assertions in server/api.test.js**

Update `server/api.test.js` expected IDs from `SD-001`, `SD-002` to `SD-1`, `SD-2`.

- [ ] **Step 5: Verify all server API tests pass**

Run: `pnpm test server/api.test.js`  
Expected: PASS (26 tests)

- [ ] **Step 6: Commit**

```bash
git add server/db.js server/server.js server/api.test.js
git commit -m "feat(server): unpad scooter IDs to integer format and add DB migration"
```

---

### Task 2: Pure Online Client Storage Layer & Hook Hardening

**Files:**
- Modify: `src/storage.js:1-120`
- Modify: `src/hooks/useScooterData.js:1-43`
- Test: `src/storage.test.js`

**Interfaces:**
- Consumes: REST API (`/api/scooters`, `/api/activity-log`, `/api/export`)
- Produces: Direct online promise-based storage methods with error resets and network failure handling.

- [ ] **Step 1: Verify pure online implementation in src/storage.js**

Ensure no fallback to `localStorage` or `trackbike:bikes` keys. Ensure clear error messages when `fetch` fails:
```javascript
async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  }).catch(err => {
    throw new Error(`Tidak dapat terhubung ke server backend API: ${err.message}`)
  })

  if (options.raw) return res

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Permintaan gagal (${res.status})`)
  return data
}
```

- [ ] **Step 2: Enhance useScooterData hook to reset error on refresh**

In `src/hooks/useScooterData.js`, clear `error` state on successful fetch:
```javascript
const refresh = useCallback(() => {
  const load = async () => {
    try {
      const [s, l] = await Promise.all([getScooters(), getActivityLog()])
      if (mountedRef.current) {
        setScooters(s)
        setActivityLog(l)
        setError(null)
      }
    } catch (err) {
      console.error('Error fetching data:', err)
      if (mountedRef.current) {
        setError(err.message || 'Gagal membaca data dari server.')
      }
    }
  }
  load()
}, [])
```

- [ ] **Step 3: Update src/storage.test.js for unpadded IDs**

Update mocks and assertions in `src/storage.test.js` to expect unpadded IDs (`SD-1`, `SD-2`).

- [ ] **Step 4: Run storage unit tests**

Run: `pnpm test src/storage.test.js`  
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add src/storage.js src/hooks/useScooterData.js src/storage.test.js
git commit -m "refactor(storage): enforce pure online API client with error handling polish"
```

---

### Task 3: Frontend Component Test Updates & UI Alignment

**Files:**
- Modify: `src/components/ScooterCard.test.jsx`
- Test: `src/components/ScooterCard.test.jsx`

**Interfaces:**
- Consumes: Unpadded scooter objects (`{ id: 'SD-1', type: 'sd', status: 'available' }`)
- Produces: Correct component render assertions.

- [ ] **Step 1: Update ScooterCard.test.jsx test fixtures**

Update fixture IDs in `src/components/ScooterCard.test.jsx` from `SD-001` to `SD-1`.

- [ ] **Step 2: Run all frontend tests**

Run: `pnpm test`  
Expected: PASS (56 tests)

- [ ] **Step 3: Commit**

```bash
git add src/components/ScooterCard.test.jsx
git commit -m "test(components): update test fixtures for unpadded scooter IDs"
```

---

### Task 4: PM2 Ecosystem Setup & Management Scripts

**Files:**
- Create: `ecosystem.config.cjs`
- Modify: `package.json:6-15`

**Interfaces:**
- Consumes: Node.js, PM2 daemon
- Produces: PM2 background execution for `server/server.js`.

- [ ] **Step 1: Create ecosystem.config.cjs**

Create `ecosystem.config.cjs` in project root:
```javascript
module.exports = {
  apps: [
    {
      name: 'trackscooter-api',
      script: './server/server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      watch: false,
      max_memory_restart: '300M'
    }
  ]
}
```

- [ ] **Step 2: Add PM2 scripts to package.json**

Add to `package.json` `scripts`:
```json
"server:start": "node server/server.js",
"pm2:start": "npx pm2 start ecosystem.config.cjs",
"pm2:stop": "npx pm2 stop trackscooter-api",
"pm2:restart": "npx pm2 restart trackscooter-api",
"pm2:logs": "npx pm2 logs trackscooter-api"
```

- [ ] **Step 3: Test PM2 commands**

Run: `pnpm pm2:start && npx pm2 status && pnpm pm2:stop`  
Expected: PM2 launches `trackscooter-api` online and stops cleanly.

- [ ] **Step 4: Commit**

```bash
git add ecosystem.config.cjs package.json
git commit -m "feat(pm2): add PM2 ecosystem config and management scripts"
```

---

## Verification Plan

### Automated Tests
Run full test suite:
```bash
pnpm test
```
Verify ESLint:
```bash
pnpm lint
```

### Manual Verification
1. Start backend with PM2: `pnpm pm2:start`
2. Start dev UI server: `pnpm dev`
3. Add a new scooter in Manage tab without manual ID -> verify assigned ID is `SD-1` or `SJ-1` (not `SD-001`).
4. Perform checkout/return in Scanner tab -> verify activity log lists `SD-1`.
5. Check PM2 status: `npx pm2 status trackscooter-api` -> status is `online`.
