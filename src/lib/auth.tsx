import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface Business {
  id: string;
  name: string;
  owner_id: string;
  onboarding_complete: boolean;
  subscription_status: string | null;
  subscription_id: string | null;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean;
  stripe_charges_enabled: boolean;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  business: Business | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, businessName: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) loadBusiness(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) loadBusiness(session.user.id);
      else { setBusiness(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadBusiness(userId: string) {
    // Resolve via business_members (owner OR staff), not a raw owner_id match —
    // an owner is just the first business_members row (seeded automatically on
    // signup below and backfilled for existing businesses), and this is what lets
    // a future staff member's session resolve a business at all. Staff invite
    // UI/edge function to actually populate a 'staff' row doesn't exist yet — this
    // only fixes the lookup so it works once one exists.
    const { data } = await supabase
      .from("business_members")
      .select("business_id, businesses(*)")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    setBusiness((data?.businesses as unknown as Business) ?? null);
    setLoading(false);
  }

  async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }

  async function signUp(email: string, password: string, businessName: string): Promise<string | null> {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return error.message;
    if (!data.user) return "Signup failed — please try again.";

    const { data: biz, error: bizError } = await supabase
      .from("businesses")
      .insert({ owner_id: data.user.id, name: businessName.trim() })
      .select()
      .single();
    if (bizError) return bizError.message;

    // Membership is the actual authorization source of truth for every table's
    // RLS (customers/jobs/invoices/estimates/businesses/company_settings) — without
    // this row the new owner couldn't see anything they just created.
    const { error: memberError } = await supabase.from("business_members").insert({
      business_id: biz.id,
      user_id: data.user.id,
      role: "owner",
    });
    if (memberError) return memberError.message;

    // Seed default company_settings row for this business
    await supabase.from("company_settings").upsert({
      id: biz.id,
      business_name: businessName.trim(),
    });

    return null;
  }

  async function signOut() {
    // Dev bypass is a client-only shortcut around RequireAuth (see App.tsx) — clear it on
    // sign-out so a stale flag can't silently re-admit the browser without a real session.
    localStorage.removeItem("dev_bypass");
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ user, session, business, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function useIsAdmin() {
  const { user } = useAuth();
  return user?.app_metadata?.is_admin === true;
}

export function useIsSuperAdmin() {
  const { user } = useAuth();
  return user?.app_metadata?.is_super_admin === true;
}
