import { createClient, type Session, type User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState } from "react";

const SUPABASE_URL = "https://ekfnjswozausgebvbwew.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_3H-md-bm1IObwrJeS1XkSg_UjbHl8TO";

// A separate client + storage key from src/lib/supabase.ts so a portal-customer
// session never collides with (or gets overwritten by) a staff session in the same
// browser — this is what lets a staff member preview the portal in one tab while
// staying logged into the CRM in another.
export const portalSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: "fieldcrm-portal-auth",
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Share initial exchange across StrictMode effect remounts. Never redeem a
// one-time token twice or let a simultaneous getSession overwrite the result.
let initialSession: Promise<Session | null> | undefined;
function initializePortalSession() {
  if (!initialSession) initialSession = (async () => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("portal_token");
    if (token) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      await portalSupabase.auth.signOut({ scope: "local" });
      const { data, error } = await portalSupabase.auth.verifyOtp({ token_hash: token, type: "magiclink" });
      return error ? null : data.session;
    }
    const { data } = await portalSupabase.auth.getSession();
    return data.session;
  })();
  return initialSession;
}

interface PortalAuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const PortalAuthContext = createContext<PortalAuthContextValue | null>(null);

export function PortalAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    initializePortalSession().then((session) => {
      if (active) { setSession(session); setLoading(false); }
    });
    const { data: { subscription } } = portalSupabase.auth.onAuthStateChange((_event, session) => {
      if (active) setSession(session);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  async function signOut() {
    await portalSupabase.auth.signOut();
  }

  return (
    <PortalAuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </PortalAuthContext.Provider>
  );
}

export function usePortalAuth() {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error("usePortalAuth must be used inside PortalAuthProvider");
  return ctx;
}
