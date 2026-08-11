# Cara Mengaplikasikan Context System

Sistem ini **sudah terpasang** di project ini (`context/`, 208 test, zero runtime
dependency). Bagian ini menjelaskan cara memakainya di project ini, project
Node/JS lain, secara programatik, dan cara porting ke project non-JS.

---

## A. Di project ini (TrackScooter)

### 1. Inisialisasi storage

```bash
pnpm context:init          # = node context/cli.js init → buat .ai/
```

Menghasilkan:

```
.ai/
├── context/*.md           # human-readable (sensitive diredaksi)
├── knowledge/knowledge.jsonl   # source of truth (structured)
├── sessions/              # snapshot per sesi
└── manifest.json          # versi, stats, last_session, id_counters
```

### 2. (Opsional) Aktifkan LLM extractor

```bash
export ANTHROPIC_API_KEY=sk-ant-...    # ada key → LlmExtractor (Claude)
export ANTHROPIC_MODEL=claude-sonnet-4-5   # default, optional
```

Tanpa key, sistem otomatis memakai `RuleExtractor` (fallback deterministik) —
tetap berfungsi penuh, hanya klasifikasi berbasis heuristik.

### 3. Alur kerja per sesi AI

```bash
# AWAL sesi — inject konteks warisan ke prompt AI:
pnpm context:build "mau lanjutin fitur export excel"     # lihat hasil L0-L5

# SELAMA sesi — catat percakapan (user/assistant):
node context/cli.js session-begin                        # session-001
node context/cli.js message session-001 user "Kita pakai SQLite untuk database"
node context/cli.js message session-001 assistant "Siap, dicatat."

# AKHIR sesi — kompilasi eksplisit → persistent context:
node context/cli.js compile session-001 --project trackscooter

# SESI BERIKUTNYA — sesi baru terasa seperti kelanjutan:
pnpm context:build "arsitektur database"                 # L2 menunjukkan keputusan aktif + trail
```

### 4. Programatik (hook ke workflow AI / tooling)

```js
// ESM — sama dengan `node --input-type=module`
import { createSystem } from './context/index.js'

const system = createSystem({ dir: '.ai' })

// Akhir sesi (hook manual — TIDAK auto-trigger per spec):
await system.sessions.compileSession('session-001', { project: 'trackscooter' })

// Awal sesi berikutnya — bangun AI context:
const ctx = system.builder.build('user request dari operator', {
  layers: ['l0', 'l1', 'l2', 'l3'],   // L4 = on-demand, L5 = fallback raw
  budgets: { l3: 1200 },              // override budget per layer
})
console.log(ctx.text)                  // siap di-inject ke prompt
```

Contoh hook otomatis (mis. di script server / CLI wrapper):

```bash
# .ai/hooks/compile-session.sh (dipanggil manual di akhir sesi)
node context/cli.js compile "$1"
```

### 5. Perawatan

```bash
pnpm context:status       # statistik (type/status/sensitive)
pnpm context:optimize     # deprecate entry basi bernilai rendah (token optimization)
pnpm test:context         # 208+ test subsystem
```

---

## B. Di project Node/JS lain

Karena sistem ini **zero dependency** (hanya `node:fs`, `node:path`, `fetch`),
"install" = salin folder + 3 baris konfigurasi:

```bash
# 1) Salin folder (sudah terstruktur store/compiler/retrieval/builder/render/session)
cp -r context /path/to/proyek-lain/context

# 2) vitest.config.js — tambahkan include
test: { include: ['context/**/*.test.js', /* dst */] }

# 3) .gitignore
echo '.ai/' >> .gitignore

# 4) Jalankan
node context/cli.js init
```

> ⚠️ Wajib ikuti requirement #1 spec: lakukan **code review project target**
> dulu (`context/CODE_REVIEW.md`) — bahasa/runtime/konvensi project lain bisa
> berbeda (mis. TypeScript, bun, npm). Sesuaikan import path (`.js` → `.ts`)
> jika project target memakai TS.

Jika project lain punya Node ≥ 20, tidak ada dependency baru. Kalau ingin tetap
sync dengan project ini: gunakan **git submodule**:

```bash
git submodule add <repo-url> context
```

Atau (jangka panjang) publish sebagai npm package — interface `createSystem()`
sudah dirancang untuk itu.

---

## C. Porting ke project non-JS (Python/Go/Rust/…)

Arsitekturnya bahasa-agnostik; yang di-port adalah **kontrak**, bukan kodenya:

1. **ContextStore interface** — `get/add/update/supersede(oldId,newItem)/delete/search/getRelevant(context,budget)/snapshot(sessionId)`.
2. **Storage** — JSONL `knowledge.jsonl` + manifest `id_counters` (format sama, bisa dibaca tool lain).
3. **Compiler** — extract via HTTP ke Anthropic Messages API (payload sama seperti `compiler/llm.js`), validasi JSON schema `EXTRACTION_SCHEMA`, fallback rule-based.
4. **Retrieval** — rule-based scoring (keyword overlap × importance × status × confidence × recency).
5. **Builder** — layer L0–L5 + budget per layer (config.js).
6. **Render** — markdown `.ai/context/*.md` + redaksi `sensitive`.

Yang TIDAK perlu di-port: logika idempotent compiler intern — cukup format file
yang sama, sehingga `.ai/` yang dihasilkan lintas bahasa tetap kompatibel.

---

## Ringkasan cepat

| Tujuan | Command |
|---|---|
| Inisialisasi | `pnpm context:init` (atau `node context/cli.js init --dir .ai`) |
| Mulai sesi | `node context/cli.js session-begin` |
| Catat pesan | `node context/cli.js message <session> user "…"` |
| Kompilasi (akhir sesi) | `node context/cli.js compile <session> --project <nama>` |
| Bangun konteks AI | `node context/cli.js build "<user request>" --budget-l3 1200` |
| Status / optimasi | `pnpm context:status` / `pnpm context:optimize` |
| Test | `pnpm test:context` |
