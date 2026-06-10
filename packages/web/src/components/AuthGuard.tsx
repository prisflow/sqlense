import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export interface AuthUser {
  userId: string;
  username: string;
  role: string;
  displayName?: string;
}

const AuthContext = createContext<AuthUser | null>(null);
export const useAuth = () => useContext(AuthContext);

export default function AuthGuard({ role, children }: { role: string; children: React.ReactNode }) {
  const [state, setState] = useState<{ authed: false } | { authed: true; user: AuthUser }>({ authed: false });
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => {
        if (d.user?.role !== role) throw new Error();
        if (!cancelled) setState({ authed: true, user: d.user });
      })
      .catch(() => { if (!cancelled) navigate("/login", { replace: true }); });
    return () => { cancelled = true; };
  }, [role, navigate]);

  if (!state.authed) return null;
  return <AuthContext.Provider value={state.user}>{children}</AuthContext.Provider>;
}
