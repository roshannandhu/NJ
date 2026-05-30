# NJ India System — Backup & Recovery (read me!)

Your business data — product catalog, prices, images, every quotation and
warranty — lives in **one file**: `backend/nj_india.db`. This guide explains the
backup system that now protects it, and exactly how to get your data back if
something goes wrong.

Everything here is **free**. No subscriptions, no cloud accounts to pay for, no
internet required (except Google Drive sync, which is optional).

---

## 1. What protects your data now

The app now backs itself up **automatically**:

- **On launch** — every time you start the app, it snapshots the database first.
- **Daily** — while the app is open, it makes one backup per day.
- **On close** — it takes a final backup when you shut it down.

Each backup is **verified** (the app re-opens the copy and checks it isn't
corrupt) and saved to up to **three places** you choose. It keeps the newest
**30** copies in each place and deletes older ones automatically.

You can also click **Settings → Security & Backup → "Back up now"** any time.

---

## 2. One-time setup (do this once)

Open the app → **Settings → Security & Backup → Backup destinations**.
Turn on as many as you can — more places = safer.

### a) Local copies (on by default)
Already enabled. Stores backups in `backend/backups` on this PC. Fast, but on the
**same disk** as your data — so it does **not** protect against disk failure.
Keep it on, but don't rely on it alone.

### b) Google Drive (offsite — strongly recommended, free 15 GB)
1. Download **Google Drive for Desktop**: https://www.google.com/drive/download/
2. Install it and sign in with any free Google account.
3. It adds a drive (usually **`G:`**) or a folder like
   `C:\Users\<YourName>\My Drive`. Inside "My Drive", create a folder named
   **`NJ_Backups`**.
4. In the app, paste that full path into the **Google Drive** box, e.g.
   `G:\My Drive\NJ_Backups`  (or `C:\Users\<YourName>\My Drive\NJ_Backups`),
   tick **enabled**, and click **Save destinations**.

Now every backup is dropped into that folder and Google Drive uploads it to the
cloud automatically. If this whole computer is lost, your data is safe online.
**No API keys, no passwords in the app — Google Drive does the syncing.**

### c) USB / external drive (offline copy — best against ransomware)
1. Plug in a USB stick. Note its drive letter (e.g. `E:`).
2. Create a folder on it, e.g. `E:\NJ_Backups`.
3. Paste `E:\NJ_Backups` into the **USB** box, tick enabled, Save.

Leave the USB plugged in so daily backups reach it. If it's unplugged, the app
just skips it (no error) and still backs up to the other places. Plug it back in
and click **Back up now** to catch it up.

> **Tip:** Once a week, click **Back up now** with the USB plugged in, then
> unplug it and store it somewhere safe. An offline copy can't be hit by
> ransomware or a bad restore.

---

## 3. How to restore (get your data back)

### Scenario A — "I made a mistake / data looks wrong" (easiest)
In the app: **Settings → Security & Backup → "Restore from file…"** → pick the
newest `nj_backup_*.json` from any backup folder → confirm.
*(The app automatically snapshots your current data first, so even this is undoable.)*

### Scenario B — "The database is corrupt / I want the whole thing back"
1. **Close the app** (close the black command window).
2. Open a backup folder (local `backend\backups`, your Google Drive `NJ_Backups`,
   or USB). Find the newest **`nj_backup_*.db`** file.
3. Copy it into the **`backend`** folder and rename it to **`nj_india.db`**,
   replacing the existing one.
4. Start the app again with **start.bat**. Everything is back.

### Scenario C — "My computer died / was stolen"
1. Set the app up on a new PC (copy the project folder, run the setup once — see
   `DEPLOYMENT.md`).
2. Go to **drive.google.com** → sign in → open your **`NJ_Backups`** folder.
3. Download the newest **`nj_backup_*.db`**.
4. Follow **Scenario B** steps 3–4 with that file.

Backup file names are timestamped: `nj_backup_20260530_142500.db` =
30 May 2026, 14:25:00. Newest = highest number.

---

## 4. Is my data in the OLD app? (the HTML file)

You used to have a single-file app, `nj-quotation-warranty-system.html`, that
stored data inside the web browser. The app you use **now** is different (it
stores data in `nj_india.db`). If you have older history that's missing from the
new app, it may still be in the old one. To check:

1. Double-click `nj-quotation-warranty-system.html` (use the **same browser** you
   used before).
2. If it opens with lots of your old quotations/warranties → that data is still
   there and can be migrated.
3. To migrate: in that old app, **Settings → Security → Export Data** (saves
   `nj_backup_YYYY-MM-DD.json`), then run:
   ```
   cd backend
   .venv\Scripts\python migrate_from_html.py  path\to\nj_backup_2026-05-20.json  --apply
   ```
   (Start the new app first. It snapshots current data before importing.)

> **Note:** browser storage is per-browser and per-PC. If you've since switched
> browsers or computers, the old data may already be gone — there's nothing the
> new app could have done about that, which is exactly why the new automatic
> backups matter going forward.

---

## 5. The status panel (what to watch)

In **Settings → Security & Backup** you'll see:

- **"Last verified backup"** + green shield = you're protected. If it turns red
  ("Backup needed") or a yellow bar appears at the bottom of the screen, you
  haven't had a good backup in 7+ days — click **Back up now**.
- **Destination chips** — green check = that place is working; "not available"
  (e.g. USB unplugged, Drive not running) means it's being skipped.
- **Storage health** — your database size. **Green** is healthy. **Amber/Red**
  means it's getting large (lots of warranty images); keep cloud + USB backups
  current, and consider clearing very old history (with a backup first).

---

## 6. Honest limitations

- Backups only run **while the app is open** (plus on launch/close). If you never
  open the app for weeks, no new backups are made — open it regularly.
- A `.db` restore must be done with the app **closed** (Windows locks the file
  while it's running). The in-app `.json` restore works while it's open.
- Google Drive offsite protection depends on Drive for Desktop being installed
  and signed in. Check occasionally that the chip shows green.
