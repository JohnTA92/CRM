import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface Business {
  id: string;
  name: string;
  owner_id: string;
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
    const { data } = await supabase
      .from("businesses")
      .select("*")
      .eq("owner_id", userId)
      .single();
    setBusiness(data ?? null);
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

    const { error: bizError } = await supabase.from("businesses").insert({
      owner_id: data.user.id,
      name: businessName.trim(),
    });
    if (bizError) return bizError.message;

    // Seed default company_settings row for this business
    await supabase.from("company_settings").upsert({
      id: data.user.id,
      business_name: businessName.trim(),
    });

    return null;
  }

  async function signOut() {
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
