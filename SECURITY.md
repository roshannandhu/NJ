# SECURITY.md
# Security Architecture and Practices

---

## 1. Threat Model

This is a **single-device, offline, internal business tool**. The threat model is therefore limited but specific:

| Threat | Likelihood | Impact | In Scope? |
|--------|-----------|--------|-----------|
| Walk-by casual access | Medium | Medium | YES — PIN lock addresses this |
| Disgruntled employee data access | Low | Medium | Partial — PIN helps |
| Network-based attacks | None | None | NO — no network connection |
| SQL injection | None | None | NO — no SQL database |
| XSS via user inputs | Low | Medium | YES — escapeHTML() prevents this |
| Data exfiltration | Low | Low | Partial — data is local only |
| Malicious file import | Low | Medium | YES — validated on import |
| Physical theft of machine | Low | High | NO — outside scope |
| Forensic data extraction | Low | High | Acknowledged — not encrypted |

---

## 2. Input Sanitisation (XSS Prevention)

**All user-supplied data rendered via innerHTML MUST use `escapeHTML()`.**

```javascript
function escapeHTML(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}
```

### Mandatory Usage Points

| Location | Data | Risk Without |
|----------|------|-------------|
| Class name in card | `cls.name` | Injected `<script>` tag |
| Variety name in grid | `v.name` | Same |
| Customer name in cart | `customer.name` | XSS in modal |
| Customer name in quotation doc | `q.customer.name` | XSS in doc |
| Warranty content fields | All warranty template text | Script injection |
| History table rows | All customer/ID fields | Row injection |
| Modal body content | All interpolated data | DOM breakout |
| Toast message | Error messages | Minimal risk but good practice |

### Safe Pattern

```javascript
// UNSAFE — never do this:
modal.innerHTML = `<h2>${cls.name}</h2>`;

// SAFE — always do this:
modal.innerHTML = `<h2>${escapeHTML(cls.name)}</h2>`;
```

---

## 3. PIN Lock

### Purpose
Device-level casual access prevention. Prevents walk-by access at the sales desk.

### Implementation
```javascript
// On app load:
if (DATA.settings.pinEnabled) {
  document.getElementById('pinOverlay').style.display = 'flex';
  document.getElementById('pinInput').focus();
}

// On PIN submit:
function checkPin() {
  if (pinInput.value === DATA.settings.pin) {
    pinOverlay.style.display = 'none';
    init();
  } else {
    toast('Wrong PIN');
    pinInput.value = '';
  }
}
```

### Limitations (Documented and Accepted)
- PIN is stored in localStorage as plaintext
- The localStorage JSON is accessible via browser DevTools
- Purpose is casual deterrence, NOT cryptographic security
- A technical person with physical access to the machine CAN bypass the PIN

### PIN Recovery
- No "Forgot PIN" feature by design
- Recovery: clear localStorage via browser DevTools (loses all data)
- Or: import a JSON backup on a fresh browser profile

### PIN Best Practices
- Recommend changing from default `1234` on first use
- 4–6 digits accepted

---

## 4. Data Integrity

### Snapshot Principle
All generated documents store complete data snapshots. This prevents:
- Historical documents showing wrong prices if products are later edited
- Legal disputes from reprinted documents that differ from originals

### Import Validation
```javascript
function importData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const imported = JSON.parse(e.target.result);  // Parse first
      // Confirm before replacing
      if (confirm('Replace current data with imported data?')) {
        DATA = { ...DEFAULT_DATA, ...imported };     // Safe merge with defaults
        saveData();
      }
    } catch(err) {
      toast('Import failed');  // Never expose raw error to user
    }
  };
}
```

The `{ ...DEFAULT_DATA, ...imported }` pattern ensures missing fields default gracefully rather than causing crashes.

---

## 5. localStorage Security

### Storage Key
```javascript
const STORAGE_KEY = 'nj_app_data_v2';
```

### Access Control
- Only accessible from the same origin (browser same-origin policy)
- Not accessible across browser profiles
- Not accessible from other websites

### Data Sensitivity
Customer data stored:
- Name, phone, email, address
- Purchase history with amounts

This data is:
- Not transmitted anywhere (no network)
- Accessible only via the browser on this device
- In plaintext JSON format

**Recommendation:** If machine is shared, always set a PIN. If machine is lost or stolen, no remote wipe is available — advise user accordingly.

---

## 6. PDF Security

PDFs are generated client-side and downloaded to the machine:
- No server transmission
- No cloud upload
- Files are standard PDF — no password protection applied
- Files are stored in the user's Downloads folder by default

**Future enhancement:** Electron version could use native file dialog with configurable save path.

---

## 7. Dependency Security

| Library | Source | Risk |
|---------|--------|------|
| jsPDF v2.5.1 | cdnjs.cloudflare.com | Trusted CDN, pinned version |
| html2canvas v1.4.1 | cdnjs.cloudflare.com | Trusted CDN, pinned version |
| Google Fonts | fonts.googleapis.com | Trusted, CSS only, no JS |

**Offline concern:** CDN resources require internet on first load. After caching, work offline. For air-gapped environments, bundle these libraries locally in the HTML file.

**Hardening for production:**
```html
<!-- Use SRI (Subresource Integrity) hashes to prevent CDN tampering -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
  integrity="sha512-EXACT_HASH_HERE"
  crossorigin="anonymous"></script>
```

---

## 8. Data Backup Security

The JSON export contains all customer data. Handle with care:
- Store backup files in a secure location (not Desktop, not shared drive)
- Consider encrypting the backup file if stored in cloud
- Delete old backups when no longer needed

---

## 9. Reset Data Safety

Double-confirmation prevents accidental complete data loss:

```javascript
function resetData() {
  if (!confirm('Reset all data to defaults? This cannot be undone.')) return;
  if (!confirm('Are you absolutely sure? All quotations and warranties will be deleted.')) return;
  // Only then proceed
}
```

---

## 10. Security Checklist

### Current Implementation
- [x] XSS prevention via escapeHTML() on all user inputs in innerHTML
- [x] PIN lock for casual access prevention
- [x] Import validation with try/catch
- [x] Double confirmation for destructive actions
- [x] No network transmission of customer data
- [x] No server-side attack surface

### Recommended Improvements
- [ ] Add SRI hashes to CDN script tags
- [ ] Bundle CDN libraries locally for true offline + security
- [ ] Recommend PIN change from default on first run
- [ ] Add localStorage usage meter to warn before quota exceeded
- [ ] Consider Electron's `contextIsolation` and `nodeIntegration: false` for v2

### Out of Scope (Accepted Limitations)
- No encryption of localStorage data
- No role-based access control (single user)
- No audit logging of data changes
- No remote wipe capability
