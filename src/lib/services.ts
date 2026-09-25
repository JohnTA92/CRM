import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

export interface Service {
  id: string;
  value: string;
  label: string;
  description: string | null;
  color: string | null;
  active: boolean;
  created_at: string;
}

// Share invalidation events, never account data. Each mounted consumer cancels
// stale results when the signed-in user or business changes.
const listeners = new Set<() => void>();

export async function fetchServices(businessId: string): Promise<Service[]> {
  if (!businessId) return [];
  const { data, error } = await supabase.from("services").select("*")
    .eq("business_id", businessId).eq("active", true).order("label");
  if (error) throw error;
  return data ?? [];
}

export function invalidateServicesCache() {
  listeners.forEach((refresh) => refresh());
}

export function useServices() {
  const { business, user } = useAuth();
  const businessId = business?.id ?? "";
  const key = `${user?.id ?? ""}:${businessId}`;
  const [state, setState] = useState<{ key: string; services: Service[] }>({ key: "", services: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    listeners.add(refresh);
    return () => { listeners.delete(refresh); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    fetchServices(businessId)
      .then((services) => { if (!cancelled) setState({ key, services }); })
      .catch((e) => { if (!cancelled) { setState({ key, services: [] }); setError(e.message); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [businessId, key, revision]);

  return { services: state.key === key ? state.services : [], loading, error };
}

export function serviceLabel(value: string, services: Service[]): string {
  return services.find((s) => s.value === value)?.label ?? value;
}
