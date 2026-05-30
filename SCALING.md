# SCALING.md
# Scaling Strategy and Future Growth

---

## 1. Current Scale (v1 Baseline)

```
Single device:        1
Concurrent users:     1 (by design)
Data volume:          ~5 MB localStorage max
Quotations/month:     ~100 (estimated NJ India volume)
Years before limits:  8+ (at current usage rate)
```

This is not a high-scale system. It's intentionally a single-machine tool. Scaling considerations are:
1. **Data volume** — will localStorage run out?
2. **Feature growth** — can the codebase handle more features?
3. **Multi-device** — what if NJ India opens more showrooms?
4. **Team growth** — what if multiple sellers need simultaneous access?

---

## 2. Data Scaling

### localStorage Capacity Analysis

```
Capacity:          ~5 MB per browser origin
Per quotation:     ~5 KB (JSON with ~10 items)
Per warranty cert: ~2 KB
Per variety:       ~0.5 KB

At 100 quotations/month:
  Month 1:   0.5 MB (quotations) + ~0.05 MB (base data)
  Year 1:    ~6 MB — approaching limit
  Mitigation: Move to IndexedDB (same code pattern, much larger)
```

### IndexedDB Migration Path

When localStorage approaches 4 MB limit:

```javascript
// Current (localStorage):
function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
}

// Future (IndexedDB — same interface, transparent upgrade):
async function saveData() {
  const db = await openDB('nj_app', 2);
  await db.put('data', DATA, STORAGE_KEY);
}
```

This can be done transparently without changing any other code — only the `saveData()` and `loadData()` functions need updating.

### Archiving Strategy (Year 2+)

For long-term use, implement selective archiving:
1. Export quotations older than 2 years to JSON archive file
2. Remove from active DATA
3. Keep warranty certificates as they are legal documents

---

## 3. Feature Scaling

### Current Architecture Risks

The single-file HTML approach has limits:

| Risk | Trigger | Mitigation |
|------|---------|-----------|
| File becomes too large | > 200 KB | Split into modular files |
| Global function namespace pollution | > 100 functions | Use module pattern or ES modules |
| Hard to test | Growing complexity | Add testing framework |
| Hard to maintain | Multiple developers | Move to framework (Vue/React) |

### Code Splitting Strategy (v1.5)

```
index.html              (Entry point only)
├── css/
│   ├── variables.css
│   ├── layout.css
│   ├── components.css
│   ├── document.css
│   └── print.css
└── js/
    ├── data.js         (DATA schema + defaults)
    ├── storage.js      (loadData/saveData)
    ├── state.js        (APP_STATE)
    ├── utils.js        (escapeHTML, formatINR, uid, toast)
    ├── pages/
    │   ├── home.js
    │   ├── checkout.js
    │   ├── quotation.js
    │   ├── warranty.js
    │   ├── history.js
    │   └── settings.js
    ├── cart.js
    ├── modal.js
    ├── pdf.js
    └── main.js
```

---

## 4. Multi-Device Scaling (v3+)

If NJ India opens additional locations or assigns multiple sellers:

### Option A — Shared JSON File (Simple)

```
Each device exports data at end of day.
Manager merges files manually using import.
No real-time sync, but sufficient for small team.
```

### Option B — Local Network Sync (Medium)

```
One device acts as "server" (simple Node.js server).
Other devices connect via LAN (WiFi same router).
No internet required.
Data syncs over local network.
```

```
Device A (Server) ←──── LAN WiFi ────→ Device B
└── Node.js express                    └── Browser client
└── Flat JSON file as DB              └── Same HTML app
```

### Option C — Cloud Sync (Full Scale)

```
Frontend: Same HTML/JS app (or Vue/React rewrite)
Backend: FastAPI or Express.js
Database: PostgreSQL
Auth: JWT tokens with role-based access
Hosting: DigitalOcean Droplet or Railway
```

This requires a significant architectural pivot and is only warranted if:
- Multiple showrooms exist
- Real-time collaboration is needed
- Data centralisation is legally required

---

## 5. Caching Strategy

### Current (Implicit)

- Google Fonts: cached by browser after first load
- jsPDF/html2canvas CDN: cached by browser after first load
- localStorage: already the persistence layer, no additional caching needed

### Service Worker (v2 — Electron Alternative)

For browser-based deployment (not Electron), add a service worker for true offline:

```javascript
// sw.js — cache all static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open('nj-app-v2').then(cache => {
      return cache.addAll([
        '/',
        '/index.html',
        '/libs/jspdf.umd.min.js',
        '/libs/html2canvas.min.js'
      ]);
    })
  );
});
```

This ensures the app works completely offline even on first load, regardless of CDN availability.

---

## 6. Bottleneck Analysis

| Bottleneck | Trigger | Solution |
|-----------|---------|---------|
| localStorage full | 8+ years of use | Migrate to IndexedDB |
| PDF generation slow | Very long quotations (20+ items) | Use pdfmake instead of html2canvas |
| App file > 200KB | Feature growth | Split to modular files |
| Many history records | 500+ quotations | Add pagination to history tables |
| Slow re-render | Complex settings pages | Targeted DOM updates instead of full re-render |

---

## 7. Performance Budget

| Metric | Current | Target |
|--------|---------|--------|
| App file size | ~150 KB | < 300 KB |
| Initial load time (cached) | < 100ms | < 100ms |
| PDF generation time | 2–4 seconds | < 3 seconds |
| History search (100 records) | < 50ms | < 100ms |
| localStorage save | < 10ms | < 20ms |

---

## 8. Version Upgrade Path

```
v1 (Current)
  └── Single HTML file
  └── localStorage
  └── CDN libraries
  └── Browser or file:// protocol

v2 (Next — 3-6 months)
  └── Electron wrapper
  └── Same HTML core
  └── Native file dialogs
  └── Auto-update support
  └── .exe installer

v1.5 (Parallel — optional refactor)
  └── Split into CSS/JS modules
  └── Serve via local Python/Node server
  └── Add SRI hashes

v3 (12+ months — if multi-device needed)
  └── Vue 3 or React frontend
  └── Vite build
  └── FastAPI backend (Python)
  └── PostgreSQL database
  └── JWT authentication
  └── Docker deployment
  └── Cloud hosting (DigitalOcean)
```
