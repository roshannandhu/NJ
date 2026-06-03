# Builder ↔ Tester Coordination Board

Two Claude terminals work this repo at once:
- **BUILDER** (terminal 1) — builds features from the Build Queue.
- **TESTER** (terminal 2) — runs tests, finds bugs, fixes small ones, reports big ones.

They share the **same working files**, so this board is the lock. **Rules:**
1. Before editing a file, add it under **🔒 In Progress** with your name. Never edit
   a file the other side already locked — pick something else or wait.
2. After finishing, **commit immediately** (small commits) and clear your lock.
3. Re-read this board before each action; it changes under you.
4. Builder owns `backend/` + `frontend/` + `mobile/` feature code. Tester owns
   `tests/` and may patch a bug anywhere **only after locking that file here**.

---

## 🔒 In Progress (active file locks)
- BUILDER: queue item #4 (backend updated_at + tombstones). NOTE: TESTER has been
  editing backend/ — will lock specific files (models.py, routers/quotations.py,
  routers/warranties.py, routers/sync.py) just before editing each.

## 📥 Build Queue (Builder works top-down)
4. Backend: per-record `updated_at` + `deleted_at` tombstones for delta sync.
5. Web: responsive/mobile polish of existing desktop screens.

## 🧪 Ready to Test (Builder → Tester handoff)
_(Builder moves finished items here with the commit hash.)_

## 🐞 Test Results / Open Bugs (Tester → Builder)
_(Tester logs failures here: what, where, repro. Builder fixes from the queue top.)_

## ✅ Done
- Phase 1 backend (sync + auth + Postgres-ready) — 9f86a46
- Phase 2 web login — cc57d56
- Phase 3 mobile scaffold (read-only lists) — af73125
- Mobile quotation CREATE flow (catalogue → qty → customer → save) — payload tested green
- Mobile quotation PDF generate + native share (expo-print/sharing) — HTML builder tested green
- Mobile catalogue browser + company details on Account screen — babel-validated

---

## Test commands (Tester uses these)
- Backend (throwaway DB, never touches real data):
  `cd backend && NJ_DATA_DIR=$(mktemp -d) NJ_DB_PATH=$(mktemp -u).db .venv/Scripts/python.exe -m pytest -q`
  (and the TestClient smoke checks if no pytest suite yet)
- Web build: `cd frontend && npm run build`
- Mobile syntax: babel-transform every file under `mobile/src` + `mobile/App.js`

## Definition of DONE (when BOTH terminals stop)
Build Queue empty **and** Open Bugs empty **and** all three test commands green.
