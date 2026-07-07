"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  clearAuthToken,
  fetchMe,
  getAuthToken,
  loginRequest,
  setAuthToken,
  signupRequest,
  type GqlUser,
} from "@/lib/graphql-client";

interface AppState {
  user: GqlUser | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: { email: string; password: string; name?: string }) => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<void>;
}

const AppContext = createContext<AppState | undefined>(undefined);

export function AppStateProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [user, setUser] = useState<GqlUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function hydrateSession() {
    const storedToken = getAuthToken();
    if (!storedToken) {
      setUser(null);
      setToken(null);
      setLoading(false);
      return;
    }

    setToken(storedToken);

    try {
      const response = await fetchMe(storedToken);
      setUser(response.me);
      if (!response.me) {
        clearAuthToken();
        setToken(null);
      }
    } catch {
      clearAuthToken();
      setUser(null);
      setToken(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void hydrateSession();
  }, []);

  async function login(email: string, password: string) {
    const response = await loginRequest({ email, password });
    setAuthToken(response.login.token);
    setToken(response.login.token);
    setUser(response.login.user);
  }

  async function signup(input: { email: string; password: string; name?: string }) {
    const response = await signupRequest(input);
    setAuthToken(response.register.token);
    setToken(response.register.token);
    setUser(response.register.user);
  }

  function logout() {
    clearAuthToken();
    setToken(null);
    setUser(null);
  }

  async function refreshSession() {
    await hydrateSession();
  }

  const value = useMemo<AppState>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      loading,
      login,
      logout,
      signup,
      refreshSession,
    }),
    [loading, token, user],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppStateProvider");
  }

  return context;
}
