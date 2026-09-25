import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
const button = "border rounded px-3 py-2 bg-white disabled:opacity-40";
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
  if (!owner)
    return (
      <p className="text-sm">
        Employee invitations and shared locations are managed by the business
        owner.
      </p>
    );
  return (
    <section className="my-6 bg-white rounded-xl border p-4 space-y-4">
      <h2 className="font-semibold text-lg">Employee access & locations</h2>
      <a className="underline block" href="/employee-preview">
        View Employee Hub
      </a>
      <p className="text-sm">
        Invite links last 7 days and require the crew member’s verified email.
        Employees receive assigned-job access only. Invitations are generated
        here for you to share; no email is sent automatically.
      </p>
      <a
        className="underline"
        href="/employee"
        target="_blank"
        rel="noopener noreferrer"
      >
        Open employee sign-in
      </a>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <button className={button} onClick={load}>
        Refresh employee status
      </button>
      {crew.length === 0 && (
        <p>Add an active crew member with an email first.</p>
      )}
      {crew.map((c) => {
        const s = status.find((s) => s.crew_id === c.id);
        const fresh =
          c.active &&
          s?.sharing &&
          s.latitude != null &&
          Date.now() - new Date(s.updated_at).getTime() < 120000;
        return (
          <div key={c.id} className="border rounded p-3 space-y-2">
            <strong>{c.name}</strong>
            <p>
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
                  {s?.invited ? "Replace invitation" : "Create invitation"}
                </button>
              )}
              {(s?.connected || s?.invited) && (
                <button
                  className={button}
                  disabled={busy}
                  onClick={() => access(c.id, "revoke")}
                >
                  Revoke employee access
                </button>
              )}
            </div>
            <p className="text-sm">
              {fresh
                ? `Location shared ${new Date(s.updated_at).toLocaleTimeString()} · accuracy about ${Math.round(s.accuracy)} m`
                : "No current shared location"}
            </p>
            {fresh && (
              <a
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
                href={`https://www.google.com/maps/search/?api=1&query=${s.latitude},${s.longitude}`}
              >
                View shared location in Google Maps
              </a>
            )}
          </div>
        );
      })}
      {invite && (
        <div className="p-3 border rounded">
          <label className="block">
            Employee invitation link
            <input
              aria-label="Employee invitation link"
              readOnly
              value={invite}
              className="w-full p-2 border rounded"
            />
          </label>
          <button
            className={button}
            onClick={() =>
              navigator.clipboard
                .writeText(invite)
                .then(() => setSaved("Invitation copied."))
                .catch(() =>
                  setError(
                    "Could not copy. Select and copy the link manually.",
                  ),
                )
            }
          >
            Copy invitation
          </button>
          <p className="text-sm">
            Creating a replacement invalidates the previous unused invitation.
          </p>
        </div>
      )}
      <details>
        <summary className="font-semibold cursor-pointer">
          Route setup: save customer site pins
        </summary>
        <p className="text-sm my-2">
          Enter verified coordinates for the customer’s service address. No
          customer addresses are sent to a geocoding service. Pins must be
          updated if the address changes.
        </p>
        <label className="block">
          Customer
          <select
            aria-label="Route pin customer"
            className="block border p-2 w-full"
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
        <div className="grid sm:grid-cols-2 gap-2 my-2">
          <label>
            Latitude
            <input
              aria-label="Site latitude"
              type="number"
              step="any"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="block border p-2 w-full"
            />
          </label>
          <label>
            Longitude
            <input
              aria-label="Site longitude"
              type="number"
              step="any"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className="block border p-2 w-full"
            />
          </label>
        </div>
        <button className={button} disabled={busy} onClick={pin}>
          Save route pin
        </button>
      </details>
      {saved && <p role="status">{saved}</p>}
    </section>
  );
}
