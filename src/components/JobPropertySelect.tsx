import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { AlertCircle } from "lucide-react";

const address = (row: any) => [row?.address, row?.city, row?.state, row?.zip].filter(Boolean).join(", ");

export function JobPropertySelect({ businessId, customerId, value, onChange }: {
  businessId: string; customerId: string; value: string; onChange: (value: string) => void;
}) {
  const [properties, setProperties] = useState<any[]>([]);
  const [primaryAddress, setPrimaryAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setProperties([]); setPrimaryAddress(""); setError("");
    if (!customerId || !businessId) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      supabase.from("customer_properties").select("id,label,address,city,state,zip").eq("business_id", businessId).eq("customer_id", customerId).order("created_at"),
      supabase.from("customers").select("address,city,state,zip").eq("business_id", businessId).eq("id", customerId).single(),
    ]).then(([props, customer]) => {
      if (!current) return;
      setLoading(false);
      setError(props.error?.message || customer.error?.message || "");
      setProperties(props.data ?? []);
      setPrimaryAddress(address(customer.data));
    });
    return () => { current = false; };
  }, [businessId, customerId, attempt]);
  return <div className="space-y-2">
    <label className="block text-[12px] font-semibold text-ink-quiet" htmlFor="job-service-property">Service property</label>
    <select id="job-service-property" value={value} onChange={e => onChange(e.target.value)} disabled={!customerId || loading || !!error}
      className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white">
      <option value="">Customer’s main address{primaryAddress ? ` — ${primaryAddress}` : " (no address saved)"}</option>
      {value && !properties.some(p => p.id === value) && <option value={value}>Saved property {loading ? "— loading…" : "— unavailable"}</option>}
      {properties.map(p => <option key={p.id} value={p.id} disabled={!address(p)}>{p.label} — {address(p) || "Add an address first"}</option>)}
    </select>
    {error && (
      <p role="alert" className="text-[12px] text-[#dc2626] flex items-center gap-1.5">
        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> Could not load properties.
        <button type="button" className="underline font-medium" onClick={() => setAttempt(v => v + 1)}>Retry</button>
      </p>
    )}
    <div className="flex items-center gap-3 flex-wrap">
      {customerId && <Link className="text-[11px] text-ink-quiet hover:text-ink transition-colors" to={`/customers/${customerId}`} target="_blank" rel="noopener noreferrer">Manage this customer's properties</Link>}
      {customerId && <button type="button" className="text-[11px] text-ink-quiet hover:text-ink transition-colors" onClick={() => setAttempt(v => v + 1)}>Refresh properties</button>}
    </div>
    <p className="text-[11px] text-ink-quiet">The service address is saved with the job. Saving job edits refreshes it from the selected property or main address.</p>
  </div>;
}
