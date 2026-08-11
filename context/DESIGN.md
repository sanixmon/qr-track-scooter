# Persistent Context Inheritance System — Design

Sistem yang mengkompilasi percakapan AI menjadi persistent knowledge terstruktur,
agar sesi berikutnya mewarisi *state, keputusan, constraint, dan konteks* —
bukan raw transcript.

**Prinsip inti:** `AI → conversation → context compiler → persistent knowledge → context retrieval → AI`.
Bukan `AI → simpan chat → masukkan semua chat ke sesi berikutnya`.

---

## 1. Arsitektur

```
context/
├── index.js           → public API facade (createSystem)
├── cli.js             → CLI: init / session-begin / message / compile / build / status
└── lib/
    ├── normalize.js   → tokenize, stopwords (id/en), normalizeText, jaccard/similarity
    ├── ids.js         → id generator ({type}-NNN)
    ├── store.js       → ContextStore contract + MemoryContextStore
    ├── fileStore.js   → FileContextStore (JSONL, atomic write)  ← default
    ├── topics.js      → extractTopic: kategori domain + pola "untuk/for" + fallback
    ├── extractor.js   → utterance split + klasifikasi deterministik (FACT/DECISION/…)
    ├── compiler.js    → pipeline: extract → resolve → persist → snapshot
    ├── relevance.js   → search + getRelevant (ranking: overlap/recency/importance/status/confidence)
    ├── builder.js     → ContextBuilder: assembling layer L0–L5 + token budget
    ├── output.js      → human-readable markdown (.ai/context/*.md) + manifest
    └── session.js     → SessionManager: lifecycle sesi + snapshot
```

Alur data:

```
SessionManager.beginSession
   └─ recordMessage (user/assistant)
Compiler.compile(session)
   ├─ extract candidates dari utterances (deterministik; pluggable untuk LLM nanti)
   ├─ classify → validate (confidence) → deduplicate → resolveContradictions
   ├─ resolve question (jawaban) & task (selesai)
   ├─ persist ke ContextStore (JSONL = source of truth)
   └─ snapshot → .ai/sessions/session-*.md + update manifest
ContextBuilder.build(userRequest)
   └─ getRelevant → susun layer L0..L5 → final AI context (token budget)
```

**Storage abstraction:** semua logika bergantung pada interface `ContextStore`
(get/add/update/supersede/delete/search/getRelevant/snapshot), bukan pada
implementasi tertentu. `FileContextStore` (JSONL) adalah default; `MemoryContextStore`
untuk test/embedding; SQLite/vector DB bisa di-swap tanpa mengubah compiler/builder.

## 2. Schema data

Setiap knowledge entry (baris JSONL):

```js
{
  id: "decision-042",            // {type}-NNN, counter per type
  type: "decision",              // fact|decision|preference|project|constraint|state|
                                 // goal|term|assumption|question|task|lesson|speculation
  content: "Use PostgreSQL",
  topic: "database",             // normalized topic key (stable = domain tunggal)
  keywords: ["postgresql", "database"],
  status: "active",              // active|superseded|deprecated|uncertain|temporary|done
  confidence: 0.9,               // 0..1
  importance: 4,                 // 1..5
  source_session: "session-017",
  created_at: "<ISO>",
  last_verified: "<ISO>",
  supersedes: null,              // id keputusan yang digantikan
  superseded_by: null,           // id pengganti
  projects: [],                  // relasi project
  meta: {}                       // detail per type (question.resolved_by, task dst.)
}
```

Provenance wajib: `source_session`, `created_at`, `last_verified`, `supersedes`/
`superseded_by`. Entry lama **tidak dihapus** saat berubah — ditandai `superseded`.

## 3. Lifecycle session

```
session-N → messages → compile(checkpoint/akhir) → snapshot → persistent context
session-(N+1) → ContextBuilder(userRequest) → AI context → conversation → compile lagi
```

Snapshot (per sesi):

```js
{
  session_id, summary,
  new_knowledge: [], updated_knowledge: [], new_decisions: [],
  superseded_items: [], open_questions: [], pending_tasks: []
}
```

Snapshot dipakai untuk memperbarui persistent context dan dirender ke
`.ai/sessions/session-*.md` (human readable).

## 4. Strategi compilation

Pipeline deterministik:

```
splitUtterances → classifyUtterance (rules, first-match-wins) → confidence/importance
→ extractTopic (category/purpose/fallback) → resolveContradictions vs store
→ persist → resolveQuestion/resolveTask → snapshot
```

Klasifikasi berbasis marker (Indonesia/Inggris):
- `decision`: pakai/gunakan/pilih/memutuskan/migrate/use/choose/decided/dipakai …
- `constraint`: harus/wajib/tidak boleh/jangan/must/cannot/maksimal/batas …
- `preference`: saya suka/lebih suka/prefer/preferensi …
- `assumption`: asumsi/anggap/asumsikan/assume/seandainya …
- `question`: diakhiri `?` / kata tanya — **hanya dari user**
- `state`: sekarang/saat ini/status/currently/sedang …
- `task`: tolong/buat/bikin/fix/perbaiki/selesaikan … — **hanya dari user**
- `goal` / `term` / `lesson` / `speculation` (mungkin/kayaknya → confidence rendah)
- `fact`: fallback kalimat deklaratif

Compiler **tidak** menganggap semua informasi sebagai fakta; speculation/assumption
diberi confidence rendah dan tidak pernah men-supersede. Extractor berupa fungsi
terisolasi sehingga dapat diganti dengan ekstraksi berbasis LLM tanpa mengubah pipeline.

## 5. Strategi retrieval

`getRelevant(query)` — ranking deterministik:

```
score = keywordOverlap × (0.5 + 0.5×importance/5) × statusFactor × confidence
        × (0.6 + 0.4×recency)
```

- `keywordOverlap` = token query ∩ (content + keywords)
- `statusFactor`: active 1, temporary 0.8, uncertain 0.6, done 0.5,
  superseded/deprecated 0 (dikecualikan kecuali `includeObsolete`)
- `recency` = exponential decay terhadap `last_verified` (half-life 30 hari)

Hasil diranking lalu dipotong top-k. Deterministik: tie-break oleh id.

## 6. Contradiction handling

`extractTopic` menandai `stable` untuk topik "single-truth" (kategori domain:
database/framework/auth/deploy/dst. + pola "untuk/for X"). Untuk entry stable
dengan **type sama dalam supersede-set {fact, state, decision, constraint}**:

| Kondisi | Aksi |
|---|---|
| Normalized content sama (similarity ≥ 0.8) | dedup: update `last_verified` |
| Content beda + confidence baru ≥ lama | old → `superseded` (`superseded_by`), new → `active` |
| Content beda + confidence baru rendah (< 0.5) | new → `uncertain`, keduanya dipertahankan |
| Content beda + confidence seimbang | new → `uncertain` (tidak mengarang pemenang) |

Contoh: `"Project menggunakan Express"` → `"Project sekarang menggunakan Fastify"`:
topik `framework` (stable) → Express `superseded`, Fastify `active`.
Topik non-stable (fallback) tidak pernah di-supersede — fakta terbuka bisa hidup berdampingan.

## 7. Strategi token optimization

- `compiler.deprecateObsolete({maxAgeDays=90, minImportance=2})` (maintenance,
  juga via CLI `optimize`): entry importance rendah + sudah lama tidak diverifikasi
  ulang → `deprecated` (bukan dihapus). Decision/constraint/goal/project
  dilindungi — tetap di context sampai eksplisit di-supersede.
- Markdown & build hanya menyertakan status `active` (+ trail singkat superseded
  di decisions.md), importance ≥ threshold per layer.
- `ContextBuilder` menyusun layer **berurutan sesuai prioritas** dan memotong di
  token budget (`maxTokens`), melaporkan `omitted`.
- Goal: *maximize continuity with minimum context tokens.*

## 8. ContextStore API

```js
ContextStore
├── get(id) → entry
├── add(entry) → stored            // validasi type/status, auto id/keywords/created
├── update(id, patch) → entry      // bump last_verified
├── supersede(id, {supersededBy, reason}) → entry
├── delete(id) → boolean           // hard delete (kesalahan nyata)
├── search(query, opts) → [{entry, score}]
├── getRelevant(query, opts) → top-k entries
├── snapshot() → {entries, stats}
└── clear()
```

Implementasi: `MemoryContextStore` (map), `FileContextStore` (JSONL + atomic
temp-rename). Tidak ada ketergantungan ke satu database/vector DB.

## 9. Testing strategy

Vitest, deterministik (injeksi `now`, tmp dir via `fs.mkdtemp`):
- store: CRUD, counter id, filter, persist roundtrip (File)
- topics: kategori/purpose/fallback + stable flag
- extractor: klasifikasi tiap type, question/task hanya dari user
- compiler: dedup, supersede (Express→Fastify, PostgreSQL→SQLite), uncertain,
  resolve question/task, bentuk snapshot
- relevance: active > superseded, relevansi, recency, includeObsolete
- builder: susunan layer, potongan budget, obsolete dikecualikan
- session/output: lifecycle penuh → file md + manifest benar

## 10. Extensibility

- **LLM extractor**: ganti `extractCandidates` (interface tetap sama) — cukup
  sediakan `compiler` dengan extractor kustom.
- **Vector DB**: implementasi `ContextStore` baru; `getRelevant` sudah menjadi
  method interface.
- **Deterministic by default**: tanpa LLM, sistem tetap berfungsi penuh (CLI).

## Layout storage (default `.ai/`)

```
.ai/
├── context/{core,project,decisions,constraints,current-state,glossary}.md
├── knowledge/knowledge.jsonl      ← source of truth (structured)
├── sessions/session-*.md          ← snapshot per sesi (human readable)
└── manifest.json                  ← versi, stats, last_session
```

Markdown adalah *compiled representation*, bukan satu-satunya source of truth.
