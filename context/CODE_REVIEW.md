# Code Review — Project Target (persyaratan #1)

Sebelum implementasi, sistem ini dikodekan dari code review terhadap project
target agar terasa *native*, bukan tempelan asing.

## Fakta terukur

| Aspek | Temuan |
|---|---|
| **Runtime** | Node.js `v24.18.0` (LTS) |
| **Package manager** | `pnpm` `11.17.0` |
| **Module system** | `"type": "module"` di `package.json` root **dan** `server/package.json` → **ESM murni** |
| **Bahasa** | **JavaScript** — tidak ada `tsconfig.json`, seluruh codebase (`src/`, `server/`) murni JS |
| **Test framework** | **Vitest** (`vitest run`), config di `vitest.config.js`, environment `happy-dom` |
| **Linter** | ESLint (flat config `eslint.config.js`, globals browser+node) |
| **Struktur** | `src/` (React + Vite frontend), `server/` (Express API), `context/` (sistem ini) |
| **Frontend** | React 19, Vite 8, Tailwind 4 |
| **Backend** | Express, better-sqlite3, PM2 |

## Keputusan bahasa/runtime (dokumentasi wajib)

**Bahasa: JavaScript (ESM).** Alasan:
1. Seluruh project murni JavaScript — tidak ada TypeScript, jadi sistem yang
   memakai TS akan jadi satu-satunya kode TS dan menambah toolchain baru.
2. ESM sudah standar di project (`"type": "module"` di root + server) — import
   sintaks `import ... from` konsisten dengan `src/` dan `server/`.
3. Tidak menambah dependency build-step; CLI bisa langsung `node context/cli.js`.

**Runtime: Node.js ≥ 20** (saat ini v24). Cukup untuk `fetch` bawaan (digunakan
extractor LLM), `node:fs/path`, regex lookbehind.

**Package manager: pnpm** — script `pnpm test`, `pnpm lint`, dan `pnpm test:context`
sesuai konvensi project.

**Test: Vitest** — file `context/test/*.test.js` terdaftar di `vitest.config.js`
melalui `include: ['context/**/*.test.js']`; ada script `pnpm test:context`.

**Storage MVP: file-based (JSONL + Markdown)** — tanpa DB eksternal, tanpa vector
DB (sesuai constraint). Diakses lewat interface `ContextStore`; `FileContextStore`
(JSONL) hanyalah satu adapter.

**Retrieval MVP: keyword/tag + rule-based scoring** — `getRelevant()` dengan
scoring function yang bisa di-swap (strategy pattern) untuk vector/embedding nanti.

**Compiler: LLM (Claude) untuk extract/classify/validate** — diisolasi di
`compiler/llm.js` dengan prompt template eksplisit + JSON schema tervalidasi,
di-mock untuk testing. `compiler/extract.js` (rule-based) menjadi fallback
deterministik ketika API key tidak tersedia atau panggilan LLM gagal.

## Konvensi kode yang diikuti

- ESM, `export`/`import`, file `.js` (bukan `.mjs`/`.ts`).
- Naming: `camelCase` fungsi/variabel, `PascalCase` kelas, kebab-case nama file.
- Lint: `no-unused-vars`, dsb. dari `@eslint/js` recommended (must pass `pnpm lint`).
- Dokumentasi desain: `context/DESIGN.md` (sesuai pola `docs/superpowers/specs`).
