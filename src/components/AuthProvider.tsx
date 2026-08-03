"use client";

import * as React from "react";

interface AuthUser {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (redirectTo?: string) => void;
  register: (redirectTo?: string) => void;
  logout: () => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ user, loading }, setState] = React.useState<AuthState>({
    user: null,
    loading: true,
  });

  React.useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        setState({
          user: data.authenticated ? data.user : null,
          loading: false,
        });
      })
      .catch(() => {
        setState({ user: null, loading: false });
      });
  }, []);

  const login = React.useCallback((redirectTo?: string) => {
    const target = redirectTo || window.location.pathname + window.location.search;
    window.location.href = `/api/auth/login?redirect=${encodeURIComponent(target)}`;
  }, []);

  const register = React.useCallback((redirectTo?: string) => {
    const target = redirectTo || window.location.pathname + window.location.search;
    window.location.href = `/api/auth/register?redirect=${encodeURIComponent(target)}`;
  }, []);

  const logout = React.useCallback(() => {
    setState({ user: null, loading: false });
    window.location.href = "/api/auth/logout";
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
