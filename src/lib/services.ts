import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export interface Service {
  id: string;
  value: string;
  label: string;
  description: string | null;
  color: string | null;
  active: boolean;
  created_at: string;
}

// Module-level cache so all components share the same fetch
let cache: Service[] | null = null;
const listeners: Array<() => void> = [];

function notify() { listeners.forEach((fn) => fn()); }

export async function fetchServices(): Promise<Service[]> {
  const { data } = await supabase
    .from("services")
    .select("*")
    .eq("active", true)
    .order("label");
  if (data) { cache = data; notify(); return data; }
  return cache ?? [];
}

export function invalidateServicesCache() {
  cache = null;
}

export function useServices() {
  const [services, setServices] = useState<Service[]>(cache ?? []);
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    const refresh = () => setServices(cache ?? []);
    listeners.push(refresh);

    if (cache === null) {
      fetchServices().then(() => setLoading(false));
    } else {
      setLoading(false);
    }

    return () => {
      const idx = listeners.indexOf(refresh);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }, []);

  return { services, loading };
}

export function serviceLabel(value: string, services: Service[]): string {
  return services.find((s) => s.value === value)?.label ?? value;
}
