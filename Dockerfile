# NJ India cloud image: builds the React web app and serves it together with the
# FastAPI backend on $PORT. Host-agnostic (works on Render, Railway, Fly, a VPS).

# ── Stage 1: build the React frontend ──
FROM node:20-alpine AS frontend
WORKDIR /fe
COPY frontend/package*.json ./
RUN npm ci || npm install
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python backend serving the API + the built SPA ──
FROM python:3.12-slim AS app
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements-cloud.txt ./
RUN pip install --no-cache-dir -r requirements-cloud.txt
COPY backend/ ./
# FastAPI serves this folder at "/" (see main.py: prefers ./dist next to backend).
COPY --from=frontend /fe/dist ./dist
EXPOSE 8000
# Bind 0.0.0.0 and honour the host-provided $PORT (default 8000 locally).
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
