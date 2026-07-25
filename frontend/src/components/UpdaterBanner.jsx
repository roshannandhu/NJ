import React, { useState, useEffect } from 'react';
import { DownloadCloud, X } from 'lucide-react';
import { API_BASE, SHARE_API_BASE } from '../api';
import { LOCAL_VERSION } from '../version';

export default function UpdaterBanner() {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    // Check for updates every time the app loads
    fetch(`${API_BASE}/api/version`)
      .then(res => res.json())
      .then(data => {
        if (data && data.version && data.version !== LOCAL_VERSION) {
          setUpdateInfo(data);
        }
      })
      .catch(err => console.error("Failed to check for updates:", err));
  }, []);

  const handleUpdate = async () => {
    setUpdating(true);
    
    // If running in Capacitor (mobile), we can't silently update via an exe.
    // Instead, we could open the download URL in the browser to download the new APK.
    if (typeof window !== 'undefined' && !!window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      // Open the URL where the new APK is hosted, or prompt the user.
      // For now, if there's a mobile URL, use it, else generic fallback.
      alert(`A new version (${updateInfo.version}) is available. Please download the new APK from the server.`);
      setUpdating(false);
      return;
    }

    // Desktop: Trigger the local backend to download and install the new EXE silently.
    try {
      const res = await fetch(`${SHARE_API_BASE}/api/local/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: updateInfo.url })
      });
      
      if (!res.ok) {
        throw new Error("Update request failed");
      }
      
      alert("Update is downloading in the background. The app will automatically close and restart shortly.");
    } catch (err) {
      console.error(err);
      alert("Failed to start the update process. You may need to download the new version manually.");
      setUpdating(false);
    }
  };

  if (!updateInfo || dismissed) return null;

  return (
    <div style={{
      background: 'var(--brand)',
      color: 'white',
      padding: '12px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      zIndex: 1000
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <DownloadCloud size={20} />
        <span style={{ fontWeight: 500, fontSize: 14 }}>
          A new update (v{updateInfo.version}) is available!
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          onClick={handleUpdate}
          disabled={updating}
          style={{
            background: 'white',
            color: 'var(--brand)',
            border: 'none',
            padding: '6px 16px',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 13,
            cursor: updating ? 'wait' : 'pointer',
            opacity: updating ? 0.7 : 1
          }}
        >
          {updating ? 'Updating...' : 'Update Now'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            padding: 4,
            opacity: 0.8
          }}
          title="Dismiss"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
