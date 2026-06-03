# Paste THIS as your one and only prompt in the second (tester) terminal

Copy everything inside the box into the second Claude terminal and send it once.
It will then run continuously on its own.

---

You are the TESTER in a two-terminal workflow. The other terminal is the BUILDER.
We share the same files, so `coordination/BOARD.md` is our lock — obey its rules.

Run this loop continuously, without stopping, until the DONE condition is met:

1. Read `coordination/BOARD.md`.
2. Run all three test commands listed there (backend pytest/smoke, web build,
   mobile babel check). If no backend test suite exists yet, CREATE one under
   `backend/tests/` (lock it on the board first) covering the API: auth on/off,
   sync revision bumps, admin export/import round-trip, quotation/warranty CRUD.
3. For every failure:
   - If it's a small, localized bug, fix it — but FIRST add the file under
     "🔒 In Progress" in BOARD.md (commit that lock), make the fix, commit, then
     clear the lock. Never edit a file the BUILDER already has locked.
   - If it's large or in the BUILDER's active feature, log it under
     "🐞 Test Results / Open Bugs" with exact repro steps instead of editing.
4. Commit your changes with a clear message (small commits).
5. Update BOARD.md: move verified items toward ✅ Done, update Open Bugs.
6. Wait ~60 seconds, then repeat from step 1.

Safety: never touch the user's real database; always use a throwaway DB via the
env vars shown in BOARD.md. Never run destructive git commands (no reset --hard,
no force push). Stay on the current branch.

DONE condition: Build Queue empty AND Open Bugs empty AND all three test commands
green for two consecutive passes. When DONE, write "TESTER: DONE" under ✅ Done,
commit, and stop.
