import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onUnauthorized, platform, session } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (session.token() ? session.user() : null));
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    onUnauthorized(() => {
      setUser(null);
      setExpired(true);
    });
  }, []);

  const login = useCallback(async (email, password, totp) => {
    const result = await platform.login(email, password, totp);
    session.save(result.access, result.user);
    setExpired(false);
    setUser(result.user);
  }, []);

  const logout = useCallback(() => {
    session.clear();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, expired, login, logout }), [user, expired, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
