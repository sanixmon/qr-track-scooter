# Design Specification: Scooter ID Refinement, Direct Database Backend, Pure Online Architecture & PM2 Deployment

**Date:** 2026-08-04  
**Status:** Proposed / Draft for User Approval  

---

## 1. Overview & Goals

This design addresses four core requirements for the **TrackScooter** system:
1. **Unpadded Scooter IDs:** Transition scooter ID formatting from zero-padded strings (`SD-001`, `SD-002`, `SJ-003`) to natural integers (`SD-1`, `SD-2`, `SJ-3`).
2. **Database Migration:** Provide a seamless SQLite database migration mechanism in `server/db.js` / `server/migrate.js` to automatically convert any existing zero-padded IDs and log references in `trackscooter.db` to unpadded integer format.
3. **Pure Online Architecture:** Ensure the system operates strictly online via the Express REST API server (`/api/scooters`, `/api/activity-log`) without any client-side `localStorage` fallbacks or synchronization layers.
4. **PM2 Backend Process Management:** Add an official PM2 ecosystem configuration (`ecosystem.config.cjs`) and npm scripts to run, monitor, and manage the backend server as a production background daemon.

---

## 2. Detailed Technical Design

### A. ID Generation & Formatting Logic (`server/server.js`)
* **Auto-generation:**
  * When creating a scooter of type `sd`, the generated ID will be `SD-1`, `SD-2`, `SD-3`, etc.
  * When creating a scooter of type `sj`, the generated ID will be `SJ-1`, `SJ-2`, `SJ-3`, etc.
* **Custom ID Inputs:**
  * If a user inputs `1` or `sd1` or `SD-001`, it will be sanitized to `SD-1`.
  * Regex matching extracts the numeric part without `padStart(3, '0')`.

### B. Database Migration Script (`server/migrate.js` / `server/db.js`)
* **Target Schema & Data:**
  * Inspect existing `scooters` and `activity_log` tables in SQLite (`trackscooter.db`).
  * Identify IDs with leading zeros (e.g. `SD-001`).
  * Run a transaction to:
    1. Update `scooters` table IDs: `SD-001` -> `SD-1`.
    2. Update `activity_log` table `scooter_id` references: `SD-001` -> `SD-1`.
* **Execution:**
  * Automatic migration check on server initialization so existing data is preserved and updated seamlessly.

### C. Pure Online Client Layer (`src/storage.js` & `src/hooks/useScooterData.js`)
* **Single Source of Truth:**
  * All CRUD actions (`getScooters`, `addScooter`, `deleteScooter`, `updateScooter`, `toggleScooterStatus`, `getActivityLog`, `exportData`) talk directly to the server API endpoints via HTTP `fetch`.
* **Error & Refresh Handling:**
  * `useScooterData` resets error states upon successful refresh and returns clear backend error messages when network/API requests fail.

### D. PM2 Integration (`ecosystem.config.cjs` & `package.json`)
* **PM2 Config File (`ecosystem.config.cjs`):**
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
* **Scripts in `package.json`:**
  * `pnpm server:start` -> `node server/server.js`
  * `pnpm pm2:start` -> `npx pm2 start ecosystem.config.cjs`
  * `pnpm pm2:stop` -> `npx pm2 stop trackscooter-api`
  * `pnpm pm2:restart` -> `npx pm2 restart trackscooter-api`
  * `pnpm pm2:logs` -> `npx pm2 logs trackscooter-api`

---

## 3. Test Coverage & Verification Strategy

1. **Server Unit & Integration Tests (`server/api.test.js`):**
   * Update ID expectation tests from `SD-001` to `SD-1`.
   * Add tests verifying database migration converts legacy zero-padded IDs to unpadded format.
2. **Frontend Storage & Component Tests (`src/storage.test.js`, `src/components/ScooterCard.test.jsx`):**
   * Update mocks and test assertions to use unpadded IDs (`SD-1`, `SJ-2`).
3. **PM2 Lifecycle Verification:**
   * Run `pnpm pm2:start`, verify `npx pm2 status`, check API endpoint `/api/scooters`, and verify `pnpm pm2:stop`.

---

## 4. User Review & Approval Required

> [!IMPORTANT]
> **Key Decisions to Confirm:**
> 1. ID format: `SD-1`, `SD-2`, `SJ-1` (with prefix) or plain `1`, `2` (without prefix)? (Defaulting to `SD-1` / `SJ-1` so scooter type is visually distinct while numbers are natural integers 1, 2, 3).
> 2. Existing database migration: Auto-migrate existing SQLite records from `SD-001` -> `SD-1` on server startup.
