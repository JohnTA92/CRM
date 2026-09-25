import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  Shield, ExternalLink, AlertCircle, RefreshCw, UserPlus, Ban, MapPin,
  Copy, Check, Navigation,
} from "lucide-react";

const button = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-paper-deep bg-white text-ink-soft hover:bg-paper-warm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const buttonPrimary = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-ink text-white hover:bg-ink/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const linkClass = "text-[12px] text-ink-quiet hover:text-ink transition-colors underline inline-flex items-center gap-1";

export function EmployeeTools() {
  const { business, user } = useAuth();
  const [crew, setCrew] = useState<any[]>([]),
    [status, setStatus] = useState<any[]>([]),
    [customers, setCustomers] = useState<any[]>([]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [invite, setInvite] = useState("");
  const [customerId, setCustomerId] = useState(""),
    [lat, setLat] = useState(""),
    [lng, setLng] = useState(""),
    [saved, setSaved] = useState("");
  const owner = business?.owner_id === user?.id;
  async function load() {
    if (!business || !owner) return;
    const [a, b, c] = await Promise.all([
      supabase
        .from("crew_members")
        .select("id,name,email,active")
        .eq("business_id", business.id)
        .order("name"),
      supabase.rpc("employee_team_status", { _business_id: business.id }),
      supabase
        .from("customers")
        .select("id,name,address,city,state,zip")
        .eq("business_id", business.id)
        .eq("archived", false)
        .order("name"),
    ]);
    const err = a.error || b.error || c.error;
    setError(err?.message ?? "");
    if (!err) {
      setCrew(a.data ?? []);
      setStatus(b.data ?? []);
      setCustomers(c.data ?? []);
    }
  }
  useEffect(() => {
    void load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    return () => clearInterval(id);
  }, [business?.id, owner]);
  async function access(id: string, action: string) {
    setBusy(true);
    setError("");
    setInvite("");
    const { data, error } = await supabase.rpc("manage_employee_access", {
      _crew_id: id,
      _action: action,
    });
    setBusy(false);
    if (error) setError(error.message);
    else {
      if (data.token)
        setInvite(`${location.origin}/employee#invite=${data.token}`);
      await load();
    }
  }
  async function pin() {
    const latitude = Number(lat),
      longitude = Number(lng);
    if (
      !customerId ||
      !lat.trim() ||
      !lng.trim() ||
      !Number.isFinite(latitude) ||
      Math.abs(latitude) > 90 ||
      !Number.isFinite(longitude) ||
      Math.abs(longitude) > 180
    ) {
      setError("Choose a customer and valid latitude/longitude.");
      return;
    }
    setBusy(true);
    const c = customers.find((c) => c.id === customerId);
    const { error } = await supabase
      .from("customer_route_pins")
      .upsert({
        business_id: business!.id,
        customer_id: customerId,
        latitude,
        longitude,
        source_address: [c.address, c.city, c.state, c.zip]
          .filter(Boolean)
          .join(", "),
      });
    setBusy(false);
    setError(error?.message ?? "");
    if (!error) setSaved(`Route pin saved for ${c.name}.`);
  }
  const [copied, setCopied] = useState(false);
  function copyInvite() {
    navigator.clipboard
      .writeText(invite)
      .then(() => { setSaved("Invitation copied."); setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => setError("Could not copy. Select and copy the link manually."));
  }
  if (!owner)
    return (
      <p className="text-[13px] text-ink-quiet">
        Employee invitations and shared locations are managed by the business
        owner.
      </p>
    );
  return (
    <section className="mb-6 bg-white rounded-xl border border-paper-deep p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-[15px] font-semibold text-ink flex items-center gap-2">
          <Shield className="w-4 h-4 text-ink-quiet" /> Employee access &amp; locations
        </h2>
      </div>
      <p className="text-[13px] text-ink-soft">
        Invite links last 7 days and require the crew member's verified email.
        Employees receive assigned-job access only. Invitations are generated
        here for you to share; no email is sent automatically.
      </p>
      <a
        className={linkClass}
        href="/employee"
        target="_blank"
        rel="noopener noreferrer"
      >
        Open employee sign-in <ExternalLink className="w-3 h-3" />
      </a>
      {error && (
        <p role="alert" className="text-[12px] text-[#dc2626] flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
        </p>
      )}
      <button className={button} onClick={load}>
        <RefreshCw className="w-3.5 h-3.5" /> Refresh employee status
      </button>
      {crew.length === 0 && (
        <p className="text-[13px] text-ink-quiet">Add an active crew member with an email first.</p>
      )}
      {crew.map((c) => {
        const s = status.find((s) => s.crew_id === c.id);
        const fresh =
          c.active &&
          s?.sharing &&
          s.latitude != null &&
          Date.now() - new Date(s.updated_at).getTime() < 120000;
        return (
          <div key={c.id} className="border border-paper-deep rounded-lg p-3.5 space-y-2">
            <p className="text-[13px] font-semibold text-ink">{c.name}</p>
            <p className="text-[13px] text-ink-soft">
              {!c.active
                ? "Inactive"
                : s?.connected
                  ? "Employee login connected"
                  : s?.invited
                    ? "Invitation pending"
                    : "No employee login"}
            </p>
            <div className="flex gap-2 flex-wrap">
              {!s?.connected && (
                <button
                  className={button}
                  disabled={busy || !c.active || !c.email}
                  onClick={() => access(c.id, "invite")}
                >
                  <UserPlus className="w-3.5 h-3.5" /> {s?.invited ? "Replace invitation" : "Create invitation"}
                </button>
              )}
              {(s?.connected || s?.invited) && (
                <button
                  className={cn(button, "text-[#dc2626] border-[#fecaca] hover:bg-[#fef2f2]")}
                  disabled={busy}
                  onClick={() => access(c.id, "revoke")}
                >
                  <Ban className="w-3.5 h-3.5" /> Revoke employee access
                </button>
              )}
            </div>
            <p className="text-[12px] text-ink-quiet">
              {fresh
                ? `Location shared ${new Date(s.updated_at).toLocaleTimeString()} · accuracy about ${Math.round(s.accuracy)} m`
                : "No current shared location"}
            </p>
            {fresh && (
              <a
                className={linkClass}
                target="_blank"
                rel="noopener noreferrer"
                href={`https://www.google.com/maps/search/?api=1&query=${s.latitude},${s.longitude}`}
              >
                <MapPin className="w-3 h-3" /> View shared location in Google Maps
              </a>
            )}
          </div>
        );
      })}
      {invite && (
        <div className="bg-paper-warm border border-paper-deep rounded-lg p-3.5 space-y-2.5">
          <label className="block">
            <span className="block text-[12px] font-semibold text-ink-quiet mb-1">Employee invitation link</span>
            <div className="flex gap-2">
              <input
                aria-label="Employee invitation link"
                readOnly
                value={invite}
                className="flex-1 px-3 py-2 text-[12px] border border-paper-deep rounded-lg bg-white text-ink-quiet truncate"
              />
              <button className={buttonPrimary} onClick={copyInvite}>
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </label>
          <p className="text-[11px] text-ink-quiet">
            Creating a replacement invalidates the previous unused invitation.
          </p>
        </div>
      )}
      <details className="border border-paper-deep rounded-lg overflow-hidden [&_summary::-webkit-details-marker]:hidden">
        <summary className="font-semibold text-[13px] text-ink cursor-pointer px-3.5 py-2.5 hover:bg-paper-warm transition-colors flex items-center gap-2">
          <Navigation className="w-3.5 h-3.5 text-ink-quiet" /> Route setup: save customer site pins
        </summary>
        <div className="px-3.5 py-3.5 border-t border-paper-deep space-y-3">
          <p className="text-[12px] text-ink-quiet">
            Enter verified coordinates for the customer's service address. No
            customer addresses are sent to a geocoding service. Pins must be
            updated if the address changes.
          </p>
          <label className="block">
            <span className="block text-[12px] font-semibold text-ink-quiet mb-1">Customer</span>
            <select
              aria-label="Route pin customer"
              className="w-full px-3 py-2 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors"
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setLat("");
                setLng("");
                setSaved("");
              }}
            >
              <option value="">Choose customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.address}
                </option>
              ))}
            </select>
          </label>
          <div className="grid sm:grid-cols-2 gap-2.5">
            <label className="block">
              <span className="block text-[12px] font-semibold text-ink-quiet mb-1">Latitude</span>
              <input
                aria-label="Site latitude"
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="w-full px-3 py-2 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors"
              />
            </label>
            <label className="block">
              <span className="block text-[12px] font-semibold text-ink-quiet mb-1">Longitude</span>
              <input
                aria-label="Site longitude"
                type="number"
                step="any"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                className="w-full px-3 py-2 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors"
              />
            </label>
          </div>
          <button className={buttonPrimary} disabled={busy} onClick={pin}>
            <MapPin className="w-3.5 h-3.5" /> Save route pin
          </button>
        </div>
      </details>
      {saved && (
        <p role="status" className="text-[12px] text-[#16a34a] flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 flex-shrink-0" /> {saved}
        </p>
      )}
    </section>
  );
}
