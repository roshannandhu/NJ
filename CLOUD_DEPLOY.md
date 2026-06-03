# Deploying NJ India to the cloud

This turns the app into a server that your PC (web browser) and the future phone
app reach from anywhere, with one shared database and login security. The local
desktop app is unaffected — it keeps running offline on SQLite.

## What's in the repo for this
- `Dockerfile` — builds the web app + backend into one image, serves on `$PORT`.
- `render.yaml` — one-click Render blueprint (web service + free Postgres).
- `backend/requirements-cloud.txt` — server dependencies (adds Postgres driver).
- `backend/cloud.env.example` — every environment variable explained.
- `backend/migrate_to_cloud.py` — pushes your existing local data up to the cloud.

## Option A — Render (easiest, free tier)
1. Push this repo to GitHub.
2. Render dashboard → **New → Blueprint** → select the repo. It reads `render.yaml`
   and creates the web service + a Postgres database, already wired
   (`DATABASE_URL` and a generated `NJ_JWT_SECRET` are set automatically).
3. In the web service's **Environment** tab, set:
   - `NJ_BOOTSTRAP_ADMIN_USER` = e.g. `admin`
   - `NJ_BOOTSTRAP_ADMIN_PASSWORD` = a strong password
   Then **Manual Deploy → Deploy latest commit** once so the admin account is created.
4. Open `https://<your-service>.onrender.com` — the web app loads. Log in.

## Option B — any Docker host (Railway, Fly.io, a VPS)
1. Provision a Postgres database; copy its connection string.
2. Build & run the image with these env vars (see `backend/cloud.env.example`):
   - `DATABASE_URL` = your Postgres URL
   - `NJ_AUTH_REQUIRED=1`
   - `NJ_JWT_SECRET` = `python -c "import secrets;print(secrets.token_urlsafe(48))"`
   - `NJ_BOOTSTRAP_ADMIN_USER` / `NJ_BOOTSTRAP_ADMIN_PASSWORD`
   The container runs `uvicorn main:app --host 0.0.0.0 --port $PORT`.

## Migrate your existing data up (one time)
On the PC that has your data, with the cloud running:
```
cd backend
python migrate_to_cloud.py --url https://<your-service> --user admin --password "<the password>"
```
It reads your local `%LOCALAPPDATA%\NJ India Data\nj_india.db`, logs in, and merges
everything into the cloud (non-destructive — safe to re-run).

## Notes / current limitations
- **Uploaded images** are stored on the container's disk, which is ephemeral on
  Render/Railway free tiers (lost on redeploy). Moving them to object storage
  (e.g. S3/Cloudflare R2) is a later hardening step.
- **Backups**: the file-copy backup scheduler is automatically disabled in cloud
  mode; rely on the host's managed Postgres backups instead.
- After deploy, the PC web client and the phone app both point at this URL and
  stay in sync automatically (the `/api/sync/version` heartbeat drives refresh).
