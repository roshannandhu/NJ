# AI_PROJECT_RULES.md — Strict operating rules for Claude sessions on the NJ India System

These rules are **binding**. They exist to protect a live single-shop business
app where data loss = lost customer quotations and warranties. Read this file and
`PROJECT_CONTEXT.md` at the start of **every** session before touching anything.

---

## 0. Read first, always

1. **Read `PROJECT_CONTEXT.md` in full before any work.** It is the inspected
   source of truth for architecture, schema, APIs, and business rules.
2. If `PROJECT_CONTEXT.md` is missing or stale relative to the code, **say so**
   and update it as part of your change.
3. Do not rely on memory or assumptions about how the app works — verify against
   the actual code.

---

## 1. Mandatory impact analysis BEFORE writing any code

For every change request, produce this analysis first (no code until it's done):

1. **Affected features** — what user-facing capability changes.
2. **Affected frontend files** — components, `api.js`, `share.js`, `AppContext`.
3. **Affected backend files** — routers, `backup_service`, `models`, `database`, `seed_data`.
4. **Affected database tables** — `app_config`, `backup_state`, `quotations`, `warranty_certificates`.
5. **Affected APIs** — exact endpoints + request/response shape changes.
6. **Business rules touched** — reference the B-* rules in `PROJECT_CONTEXT.md` §7.
7. **Backup implications** — does it change payload shape, restore, verification, or `notify_change` calls?
8. **Warranty implications** — no-orphan rule, deterministic ids, template mirroring, cascade.
9. **Quotation implications** — upsert-by-id, pricing math, per-quotation overrides, edit-preserves-id.

Then explicitly present:
- **Architecture impact** · **Database impact** · **API impact** · **Frontend impact** · **Risk analysis** · **Implementation plan**

Only after that, generate code.

---

## 2. Never create duplicate functionality

- **Search before you build.** If a service, helper, component, or endpoint
  already does it, **reuse it**. Common reuse points:
  - PDF generation → `frontend/src/share.js` (`elementToPdf`, `shareFiles`, `beginPdfSave`/`finishPdfSave`). Do not write a second PDF path.
  - Backend calls → `frontend/src/api.js` (and `share.js` for share). Add a wrapper there; don't scatter `fetch`.
  - Warranty derivation → `frontend/src/warranty.js`. Don't re-derive cert ids/templates elsewhere.
  - Backup/restore/recovery → `backend/backup_service.py`. Don't add a parallel backup mechanism.
  - Catalogue read/write → `/api/config` + `AppContext.persistConfig`.
  - Numeric inputs → `NumberField.jsx`. Toggles → `SetToggle` pattern in Settings.
- If you find near-duplicate logic, prefer **refactoring to a shared function**
  over adding a third copy.

---

## 3. Reuse existing architecture & conventions

- **State:** there is ONE store (`AppContext`). No Redux, no router. Navigation is
  the `currentView` string in `App.jsx`. Follow that pattern.
- **Styling:** matches surrounding code (mostly inline styles + a few `.css`
  files + CSS variables). Match the existing idiom; don't introduce a new styling
  system.
- **IDs are minted on the frontend** and are the upsert key — keep it that way.
- **Records are JSON blobs** in a `data` column with a few denormalised scalar
  columns. Preserve this; if you add a queryable field, denormalise it into a
  column AND add it to `_EXPECTED_COLUMNS` in `database.py`.
- **The SPA static mount stays last** in `main.py`.
- **Backup engine stays stdlib-only and never raises** into request handlers.

---

## 4. Preserve database integrity

- **Migrations:** add new columns to `_EXPECTED_COLUMNS` (`database.py`) — never
  assume `create_all()` will alter an existing table. Keep migrations idempotent.
- **Cascade:** deleting a quotation must continue to cascade-delete its warranty
  certificates (single + clear-all). Don't remove this.
- **No-orphan:** never allow a warranty certificate without a valid parent
  quotation. The backend rejects it; keep that guard.
- **Single-row tables** (`app_config`, `backup_state`) are keyed `id=1`. Don't
  create extra rows.
- Keep `version`/`updatedAt` bumped on every quotation/warranty write **and
  mirrored into the JSON blob** — recovery/conflict-resolution depends on it.

---

## 5. Preserve business rules

Do not change behaviour covered by the B-* rules in `PROJECT_CONTEXT.md` §7
unless the user explicitly asks. In particular:

- Quotation upsert-by-id (no duplicates) and edit-preserves-id/date.
- Mandatory manager name + customer name to generate.
- Pricing math: `actualPrice` immutable; offers; discount then tax; per-quotation
  overrides seeded from settings; bank snapshot.
- Warranty: no orphans, deterministic ids, one cert per template, certs mirror
  the live template, tools have no warranty, "warranty only" uses a hidden
  backing quotation kept out of history.
- Backend-offline blocking guard (never let seed defaults overwrite real data).

If a request conflicts with a business rule, **flag the conflict and confirm**
before proceeding.

---

## 6. Check backup implications before modifying

Before changing data models, the config shape, or quotation/warranty payloads:

- Will the **backup payload** (`build_payload` / `build_catalog_payload` /
  `build_history_payload`) still capture the new data? Update it if not.
- Will **restore** (`restore_from_payload`, `restore_catalog_payload`,
  `_apply_config`) and **recovery** (`analyze`/`recover`/`resolve_conflicts`)
  still round-trip the new shape? Update them together.
- Did you add a data-mutating endpoint? It must call `backup_service.notify_change(...)`
  (and `mark_catalog_changed()` for catalogue changes) so the debounced event
  backup fires.
- Keep `merge` non-destructive and `replace` snapshot-first. Keep catalogue and
  history restores isolated.

---

## 7. Check quotation ↔ warranty relationships before modifying

- A warranty's `quotationId` must point to a real quotation. Changing quotation
  id/format means re-checking deterministic cert id derivation (`warranty.js`).
- Editing a quotation re-syncs linked certs **without changing their ids**
  (`syncCertToQuotation`). Preserve that.
- Deleting/clearing quotations cascades to warranties (backend + mirrored in
  `History.jsx`). Keep both in sync.
- Warranty template edits propagate to all certificates of that type (mirroring).
  Don't accidentally freeze certs to snapshots.

---

## 8. Safe-change workflow

1. Do the §1 impact analysis.
2. Make the **smallest** change that satisfies the request; reuse existing code.
3. Touch frontend + backend + payload/restore together when the data shape changes.
4. Run/check: `backend` → `pytest` (especially `test_recovery.py`) when backup,
   models, or restore logic changes; `frontend` → `npm run lint` / `npm run build`
   when frontend changes.
5. Verify business rules still hold (B-* in §7 of context).
6. **Update `PROJECT_CONTEXT.md`** in the same change if architecture, schema,
   an API, a workflow, or a business rule changed.
7. Report honestly: what changed, what was tested, what wasn't.

---

## 9. Things that need explicit user confirmation

- Any **destructive** operation (deleting records, `mode="replace"` restores,
  dropping/altering data, removing files the user didn't create).
- Changing a **business rule** or default behaviour.
- Removing "dead code" listed in `PROJECT_CONTEXT.md` §11 (verify no references first).
- Committing, pushing, or anything outward-facing (per harness rules).
- Touching `cloud_config.json` / `cloud_tokens.json` (secrets — never commit).

---

## 10. Hard "do nots"

- ❌ Don't add a second PDF engine, backup mechanism, state store, or HTTP client.
- ❌ Don't bypass `api.js`/`share.js` with raw `fetch` in components.
- ❌ Don't let the backup engine import third-party packages or raise into requests.
- ❌ Don't move the SPA static mount above the API routers.
- ❌ Don't break upsert-by-id (would create duplicate quotations/warranties).
- ❌ Don't create warranties without a parent quotation.
- ❌ Don't save the frontend seed defaults over real data (respect the offline guard).
- ❌ Don't commit DB files, backups, uploads, or cloud secret files.
- ❌ Don't assume editing the repo fixes an *installed* app (patch `%LOCALAPPDATA%\NJ India\app` or rebuild).

---

**When in doubt: re-read `PROJECT_CONTEXT.md`, do the impact analysis, prefer
reuse, and ask before anything destructive or rule-changing.**
