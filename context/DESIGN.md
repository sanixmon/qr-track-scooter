# Persistent Context Inheritance System — Design

Sistem yang mengkompilasi percakapan AI menjadi persistent knowledge terstruktur,
agar sesi berikutnya mewarisi *state, keputusan, constraint, dan konteks* —
bukan raw transcript.

**Prinsip inti:** `AI → conversation → context compiler → persistent knowledge → context retrieval → AI`.
Bukan `AI → simpan chat → masukkan semua chat ke sesi berikutnya`.

> Bahasa/runtime/kondisi ditentukan lewat **code review project target** —
> lihat [`CODE_REVIEW.md`](./CODE_REVIEW.md): **JavaScript (ESM), Node ≥ 20,
> pnpm, Vitest**. Storage MVP file-based; compiler LLM-based (Claude) dengan
> fallback deterministik.

---

## 1. Arsitektur

```
context/
├── index.js               → public API facade (createSystem)
├── cli.js                 → CLI: init / session-begin / message / compile / build / status / supersede / optimize
├── config.js              → TOKEN BUDGET per layer (single source, env-overridable)
├── CODE_REVIEW.md         → keputusan bahasa/runtime dari code review project
├── store/
│   ├── store.js           → ContextStore contract + MemoryContextStore
│   ├── fileStore.js       → FileContextStore (JSONL, atomic) + counter di manifest
│   └── ids.js             → id {type}-NNN, counter per type
├── compiler/
│   ├── llm.js             → LlmExtractor (Claude): prompt template + JSON schema + mockable
│   ├── extract.js         → RuleExtractor (fallback deterministik)
│   ├── topics.js          → extractTopic (kategori domain + pola "untuk/for" + fallback)
│   └── compiler.js        → pipeline: extract → validate → dedup → kontradiksi → persist → snapshot
├── retrieval/
│   └── relevance.js       → search + getRelevant (scoring rule-based, budget-aware)
├── builder/
│   └── builder.js         → ContextBuilder: layer L0–L5 + token budget + redaksi sensitive
├── render/
│   └── output.js          → markdown .ai/context/*.md (redaksi sensitive) + manifest
├── session/
│   └── session.js         → SessionManager: lifecycle + snapshot
└── shared/
    └── normalize.js       → tokenize, stopwords, similarity, estimateTokens
```

Alur data:

```
SessionManager.beginSession → recordMessage
Compiler.compile(session)          ← EXPLICIT trigger (compileSession), tanpa auto-trigger
  ├─ extract: LlmExtractor (Claude, JSON tervalidasi) — fallback RuleExtractor bila gagal
  ├─ validate (JSON schema) → deduplicate → resolveContradictions
  ├─ resolve question / task
  ├─ persist ke ContextStore (JSONL = source of truth)
  └─ snapshot → .ai/sessions/session-*.md + update manifest
ContextBuilder.build(userRequest)
  └─ getRelevant → susun layer L0..L5 (budget per layer) → final AI context
```

## 2. Schema data

Setiap knowledge item (baris JSONL):

```js
{
  id: "decision-042",            // {type}-NNN, counter di manifest.json
  type: "decision",              // fact|decision|preference|project|constraint|state|
                                 // goal|term|assumption|question|task|lesson|speculation
  content: "Use PostgreSQL",
  topic: "database",             // normalized topic key (stable = domain tunggal)
  keywords: ["postgresql", "database"],
  status: "active",              // active|superseded|deprecated|uncertain|temporary|done
  sensitive: false,              // PRIVACY: diredaksi dari markdown, tetap di structured store
  confidence: 0.9,
  importance: 4,                 // 1..5
  source_session: "session-017",
  created_at, last_verified,     // ISO
  supersedes: null,              // id yang digantikan (lineage)
  superseded_by: null,           // id pengganti
  projects: [],
  meta: {}
}
```

## 3. Lifecycle session & snapshot

```
session-N → messages → compile (manual) → snapshot → persistent context
session-(N+1) → ContextBuilder(userRequest) → AI context → conversation → compile lagi
```

Snapshot:

```js
{ session_id, summary, new_knowledge: [], updated_knowledge: [],
  new_decisions: [], superseded_items: [], open_questions: [], pending_tasks: [] }
```

`ContextStore.snapshot(sessionId)` juga bisa memfilter per sesi.

## 4. Strategi compilation

- **Extract/Classify/Validate dijalankan LLM (Claude)** — `compiler/llm.js`:
  prompt template eksplisit (`SYSTEM_PROMPT`), output WAJIB JSON yang divalidasi
  (`EXTRACTION_SCHEMA`), temperature 0. Butuh reasoning untuk membedakan
  FACT vs ASSUMPTION vs SPECULATION.
- **Isolasi**: semua pemanggilan LLM di satu module; `fetchImpl`/client bisa
  di-mock; provider bisa diganti tanpa mengubah pipeline.
- **Fallback deterministik** (`compiler/extract.js`): `RuleExtractor` dipakai
  otomatis bila `ANTHROPIC_API_KEY` tidak ada atau panggilan LLM gagal
  (dictatat `extractor_used: rule-fallback` di snapshot). Ini menjaga MVP
  tetap berfungsi dan testable.
- **Trigger eksplisit**: `compileSession(sessionId)` — TIDAK ada auto-trigger
  berdasarkan jumlah pesan/token.

## 5. Strategi retrieval (MVP)

Rule-based scoring di `retrieval/relevance.js`:

```
score = keywordOverlap × (0.5 + 0.5×importance/5) × statusFactor × confidence
        × (0.6 + 0.4×recency)
```

- `statusFactor`: active 1, temporary 0.8, uncertain 0.6, done 0.5,
  superseded/deprecated 0 (dikecualikan kecuali `includeObsolete`).
- `rankRelevant(context, { budget })` memotong kandidat berdasarkan **ranking
  score** sampai batas token (enforcement budget L3).
- Scoring function terisolasi (strategy pattern) — vector/embedding bisa
  dicolok belakangan tanpa mengubah interface publik.

## 6. Contradiction handling

`extractTopic` menandai `stable` untuk topik "single-truth". Untuk item stable
dengan type sama dalam supersede-set {fact, state, decision, constraint}:

| Kondisi | Aksi |
|---|---|
| Normalized content sama (sim ≥ 0.8) | dedup: update `last_verified` |
| Content beda + confidence baru ≥ lama | old → `superseded` (`superseded_by`), new → `active` |
| Content beda + confidence baru rendah (< 0.5) | new → `uncertain`, keduanya dipertahankan |
| Content beda + confidence seimbang | new → `uncertain` (tidak mengarang pemenang) |

Lineage dijaga: `supersede(oldId, newItem)` menambah item baru dengan
`supersedes: oldId` dan menandai item lama `superseded_by: <id baru>` —
item lama **tidak pernah dihapus**.

## 7. Strategi token optimization

**Budget per layer (config.js — konstanta eksplisit, env-overridable):**

| Layer | Budget (token) |
|---|---|
| L0 Core | ~300 |
| L1 Project/Domain | ~800 |
| L2 Active Decisions & Constraints | ~800 |
| L3 Relevant Knowledge | ~1500 (dipotong berdasarkan ranking) |
| L4 Historical | on-demand (0) |
| L5 Raw | fallback terakhir |

- `resolveLayerBudgets()`: default → env (`CONTEXT_BUDGET_L0…L4`) → override.
- `ContextBuilder.build()` menegakkan budget per layer (`fitToBudget`) + cap
  total (`maxTokens`, default = jumlah budget layer yang diminta).
- `compiler.deprecateObsolete({maxAgeDays, minImportance})` → entry basi bernilai
  rendah ditandai `deprecated` (decision/constraint/goal/project dilindungi).

## 8. ContextStore API

```js
ContextStore
├── get(id)
├── list(opts)
├── add(item)                       // auto id (counter manifest), keywords, timestamp
├── update(id, patch)               // bump last_verified, refresh keywords
├── supersede(oldId, newItem)       // lineage: new.supersedes=oldId, old.superseded_by=newId
├── delete(id)
├── search(context, opts)           // [{entry, score}]
├── getRelevant(context, { budget }) // top-k ranking, budget-aware
├── snapshot(sessionId?)            // entries + stats (bisa difilter per sesi)
└── clear()
```

**ID generation:** `{type}-{zero-padded}` per project; counter disimpan di
`manifest.json` (`id_counters`). Asumsi single-writer — TODO comment untuk
locking bila ada concurrent writers.

## 9. Testing strategy (kriteria sukses)

1. **Contradiction**: A kontradiktif B → A `superseded`, B `active`.
2. **Uncertain**: dua info konflik tanpa indikator valid → `uncertain`, bukan pilih sembarangan.
3. **Deduplication**: substansi sama diinput dua kali → satu entry aktif.
4. **Token budget enforcement**: `getRelevant`/builder tidak melebihi budget L3, item importance/relevance tertinggi lolos.
5. **Sensitive redaction**: `sensitive: true` tidak muncul di compiled markdown, tetap ada di structured store.
6. **Lineage integrity**: decision yang di-supersede → `supersedes` menunjuk ID lama, ID lama tidak terhapus.

Ditambah: validasi JSON schema LLM, fallback rule-based saat LLM gagal, counter
manifest (tidak pernah reuse id), snapshot per sesi.

## 10. Extensibility

- **LLM provider**: ganti `LlmExtractor` (interface `extract(messages, ctx)`).
- **Vector DB**: implementasi `ContextStore` baru; `getRelevant` sudah method interface.
- **Deterministic by default**: tanpa API key, sistem tetap berfungsi penuh (rule fallback).

## Layout storage (`.ai/`)

```
.ai/
├── context/{core,project,decisions,constraints,current-state,glossary}.md  ← redaksi sensitive
├── knowledge/knowledge.jsonl      ← source of truth (structured)
├── sessions/session-*.md          ← snapshot per sesi (human readable)
└── manifest.json                  ← versi, stats, last_session, id_counters
```
