"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, useApi } from "@/lib/api-client";

export type SessionUser = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  isPrivate: boolean;
  bio: string | null;
  website: string | null;
};

type SessionState = {
  user: SessionUser | null;
  loading: boolean;
  setUser: (u: SessionUser | null) => void;
  logout: () => Promise<void>;
};

const SessionCtx = createContext<SessionState>({
  user: null,
  loading: true,
  setUser: () => {},
  logout: async () => {},
});

export function useSession(): SessionState {
  return useContext(SessionCtx);
}

/**
 * Fetches the session once and shares it. When `requireAuth`, unauthenticated
 * visitors are redirected to /login (preserving the current path).
 */
export function SessionProvider({
  children,
  requireAuth,
  guestOnly,
}: {
  children: React.ReactNode;
  requireAuth?: boolean;
  guestOnly?: boolean;
}) {
  const router = useRouter();
  const { data, error, loading } = useApi<{ user: SessionUser | null }>(requireAuth || guestOnly ? "/api/auth/session" : null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [redirected, setRedirected] = useState(false);

  useEffect(() => {
    if (data) setUser(data.user);
  }, [data]);

  useEffect(() => {
    if (loading || redirected) return;
    if (requireAuth && error && error.status === 401) {
      setRedirected(true);
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    }
    if (guestOnly && !error && data?.user) {
      setRedirected(true);
      router.replace("/");
    }
  }, [loading, error, data, requireAuth, guestOnly, redirected, router]);

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.replace("/login");
  }, [router]);

  return (
    <SessionCtx.Provider value={{ user, loading: loading && !error, setUser, logout }}>
      {children}
    </SessionCtx.Provider>
  );
}
