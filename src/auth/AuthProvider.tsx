import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DEMO, supabase } from "../lib/db";
import { DEMO_MEMBER } from "./demoMember";
import type { Member } from "../lib/types";

interface AuthState {
  /** undefined while the session is being restored. */
  status: "loading" | "signed-out" | "signed-in" | "not-allowed";
  member: Member | null;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  status: "loading", member: null, isAdmin: false, signOut: async () => {},
});
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>(DEMO ? "signed-in" : "loading");
  const [member, setMember] = useState<Member | null>(DEMO ? DEMO_MEMBER : null);

  useEffect(() => {
    if (DEMO) return;
    let cancelled = false;
    // The allowlist row is only readable by allowlisted users, so reading it
    // doubles as the server-side authorisation check.
    const resolve = async (email: string | undefined) => {
      if (!email) {
        if (!cancelled) { setMember(null); setStatus("signed-out"); }
        return;
      }
      const { data } = await supabase
        .from("allowed_users").select("id, email, role, display_name")
        .eq("email", email.toLowerCase()).maybeSingle();
      if (cancelled) return;
      setMember((data as Member | null) ?? null);
      setStatus(data ? "signed-in" : "not-allowed");
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // Defer: Supabase forbids awaiting its own client inside this callback.
      setTimeout(() => resolve(session?.user?.email), 0);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  const signOut = async () => {
    if (!DEMO) await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ status, member, isAdmin: member?.role === "admin", signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
