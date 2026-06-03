import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as api from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);      // session loaded from storage
  const [signedIn, setSignedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [serverUrl, setServerUrl] = useState('');

  // Global data revision (from /api/sync/version). Screens watch `revision` and
  // refetch when it changes, so edits made on the PC or another phone appear
  // automatically. Polled here once for the whole app.
  const [revision, setRevision] = useState(0);
  const pollRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { baseUrl, token } = await api.loadSession();
      setServerUrl(baseUrl);
      if (baseUrl && token) {
        try {
          const me = await api.getMe();
          if (me && (me.authenticated || !me.auth_required)) {
            setUser(me.username || 'user');
            setSignedIn(true);
          }
        } catch {
          // token expired / server changed — fall back to the login screen
          await api.setToken('');
        }
      }
      setReady(true);
    })();
  }, []);

  // Poll the sync heartbeat while signed in.
  useEffect(() => {
    if (!signedIn) return;
    let stop = false;
    const tick = async () => {
      try {
        const { revision: r } = await api.getSyncVersion();
        if (!stop) setRevision(r);
      } catch (e) {
        if (e && e.status === 401) signOut(); // session lost
      }
    };
    tick();
    pollRef.current = setInterval(tick, 5000);
    return () => { stop = true; clearInterval(pollRef.current); };
  }, [signedIn]);

  const signIn = async (url, username, password) => {
    await api.setBaseUrl(url);
    setServerUrl(api.getBaseUrl());
    const out = await api.login(username, password); // throws on bad creds
    setUser(out.username || username);
    setSignedIn(true);
  };

  const signOut = async () => {
    await api.setToken('');
    setUser(null);
    setSignedIn(false);
  };

  return (
    <AuthContext.Provider value={{ ready, signedIn, user, serverUrl, revision, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
