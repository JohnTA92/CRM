import { balanceDue, sumMoney } from "@/lib/money";
import { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Badge } from "@/design-system/primitives/Badge";
import { Button } from "@/design-system/primitives/Button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { jobStatusLabel, invoiceStatusLabel, estimateStatusLabel } from "@/data/crm";
import { useServices, serviceLabel } from "@/lib/services";
import {
  ArrowLeft, MapPin, Phone, Mail, Plus, Briefcase, FileText, Receipt,
  Loader2, Clock, CheckCircle2, AlertCircle, Send, Pencil, X, Link2,
  Home, Building2, Trash2, Check, ExternalLink, ShieldOff, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getPortalUrl } from "@/lib/portalLink";

function jobStatusBadge(s: string): "warning" | "success" | "error" | "muted" | "default" | "gold" {
  const m: Record<string, "warning" | "success" | "error" | "muted" | "default" | "gold"> = {
    draft: "muted", quoted: "warning", scheduled: "default",
    "in-progress": "gold", complete: "success", invoiced: "muted",
  };
  return m[s] ?? "default";
}
function invStatusBadge(s: string): "warning" | "success" | "error" | "muted" | "default" {
  const m: Record<string, "warning" | "success" | "error" | "muted" | "default"> = {
    draft: "muted", sent: "warning", paid: "success", overdue: "error", voided: "muted",
  };
  return m[s] ?? "default";
}
function estStatusBadge(s: string): "warning" | "success" | "error" | "muted" | "default" {
  const m: Record<string, "warning" | "success" | "error" | "muted" | "default"> = {
    draft: "muted", sent: "warning", approved: "success", declined: "error", expired: "muted",
  };
  return m[s] ?? "default";
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-ink-quiet mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-[13px] border border-paper-deep rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors"
      />
    </div>
  );
}

function mapsUrl(address: string, city?: string, state?: string, zip?: string) {
  const parts = [address, city, state, zip].filter(Boolean).join(", ");
  return `https://maps.google.com/?q=${encodeURIComponent(parts)}`;
}

interface Property {
  id: string;
  label: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
}

const EMPTY_PROPERTY = { label: "Home", address: "", city: "", state: "", zip: "", notes: "" };

function PropertyCard({
  prop,
  onSave,
  onDelete,
}: {
  prop: Property;
  onSave: (id: string, data: Omit<Property, "id">) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ label: prop.label, address: prop.address, city: prop.city, state: prop.state, zip: prop.zip, notes: prop.notes });
  const [saving, setSaving] = useState(false);

  const set = (field: string) => (value: string) => setForm((f) => ({ ...f, [field]: value }));

  async function save() {
    setSaving(true);
    const saved = await onSave(prop.id, form);
    setSaving(false);
    if (saved) setEditing(false);
  }

  const fullAddress = [prop.address, prop.city, prop.state, prop.zip].filter(Boolean).join(", ");

  if (editing) {
    return (
      <div className="border border-paper-deep rounded-xl p-4 bg-white space-y-3">
        <Field label="Label" value={form.label} onChange={set("label")} placeholder="Home, Office, Rental…" />
        <Field label="Street Address" value={form.address} onChange={set("address")} placeholder="123 Main St" />
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-1"><Field label="City" value={form.city} onChange={set("city")} placeholder="Austin" /></div>
          <Field label="State" value={form.state} onChange={set("state")} placeholder="TX" />
          <Field label="ZIP" value={form.zip} onChange={set("zip")} placeholder="78701" />
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-ink-quiet mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => set("notes")(e.target.value)}
            placeholder="Gate code, access instructions…"
            rows={2}
            className="w-full px-3 py-2 text-[13px] border border-paper-deep rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors resize-none"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-ink text-white hover:bg-ink/80 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-paper-deep bg-white hover:bg-paper-warm transition-colors text-ink"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-paper-deep rounded-xl px-4 py-3.5 bg-white group">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-paper-warm border border-paper-deep flex items-center justify-center flex-shrink-0">
          {prop.label.toLowerCase().includes("office") || prop.label.toLowerCase().includes("commercial")
            ? <Building2 className="w-4 h-4 text-ink-quiet" />
            : <Home className="w-4 h-4 text-ink-quiet" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-ink">{prop.label}</p>
          {fullAddress && (
            <a
              href={mapsUrl(prop.address, prop.city, prop.state, prop.zip)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[12px] text-ink-quiet hover:text-accent transition-colors mt-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              <MapPin className="w-3 h-3" />
              {fullAddress}
              <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
            </a>
          )}
          {prop.notes && (
            <p className="text-[12px] text-ink-quiet mt-1 italic">{prop.notes}</p>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 rounded-lg hover:bg-paper-warm text-ink-quiet hover:text-ink transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(prop.id)}
            className="p-1.5 rounded-lg hover:bg-[#fef2f2] text-ink-quiet hover:text-[#dc2626] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function CustomerDetailPage() {
  const { services } = useServices();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { business, loading: authLoading } = useAuth();
  const businessId = business?.id ?? "";
  const [customer, setCustomer] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [estimates, setEstimates] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyError, setPropertyError] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  // Portal access (secure invite) state
  const [portalAccess, setPortalAccess] = useState<{ expires_at: string; revoked_at: string | null } | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteCopyState, setInviteCopyState] = useState<"idle" | "copied" | "error">("idle");

  // Inline notes state
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Edit modal state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Add property state
  const [addingProperty, setAddingProperty] = useState(false);
  const [newProp, setNewProp] = useState(EMPTY_PROPERTY);
  const [savingProp, setSavingProp] = useState(false);

  // Staff preview only — staff's own session already has legitimate access via the
  // business_members RLS policy, so this bare-id link works for staff exactly as
  // before. It is NOT a link to hand to a customer: without a real portal session
  // (see "Generate Portal Link" below), a visitor now hits a sign-in gate, not data.
  function copyPortalLink() {
    if (!id) return;
    const url = getPortalUrl(id);
    navigator.clipboard.writeText(url).then(
      () => {
        setCopyState("copied");
        setTimeout(() => setCopyState("idle"), 2000);
      },
      () => {
        setCopyState("error");
        setTimeout(() => setCopyState("idle"), 2500);
      },
    );
  }

  function openPortal() {
    if (!id) return;
    window.open(`${getPortalUrl(id)}?preview=staff`, "_blank", "noopener,noreferrer");
  }

  async function loadPortalAccess(custId: string) {
    const { data } = await supabase
      .from("customer_portal_access")
      .select("expires_at, revoked_at")
      .eq("customer_id", custId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setPortalAccess(data ?? null);
  }

  async function sendPortalInvite() {
    if (!id) return;
    setInviteLoading(true);
    setInviteError(null);
    setInviteLink(null);
    const { data, error } = await supabase.functions.invoke("portal-invite", {
      body: { customer_id: id },
    });
    setInviteLoading(false);
    if (error || data?.error) {
      setInviteError(data?.error ?? error?.message ?? "Couldn't send the portal invite.");
      return;
    }
    setInviteLink(data.link);
    setPortalAccess({ expires_at: data.expires_at, revoked_at: null });
  }

  async function revokePortalAccess() {
    if (!id) return;
    setInviteLoading(true);
    setInviteError(null);
    const { data, error } = await supabase.functions.invoke("portal-invite", {
      body: { customer_id: id, action: "revoke" },
    });
    setInviteLoading(false);
    if (error || data?.error) {
      setInviteError(data?.error ?? error?.message ?? "Couldn't revoke access.");
      return;
    }
    setInviteLink(null);
    loadPortalAccess(id);
  }

  function copyInviteLink() {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).then(
      () => { setInviteCopyState("copied"); setTimeout(() => setInviteCopyState("idle"), 2000); },
      () => { setInviteCopyState("error"); setTimeout(() => setInviteCopyState("idle"), 2500); },
    );
  }

  useEffect(() => {
    if (id && (businessId || !authLoading)) { load(id); loadPortalAccess(id); }
  }, [id, businessId, authLoading]);

  async function load(custId: string) {
    setLoading(true);
    let custQ = supabase.from("customers").select("*").eq("id", custId);
    if (businessId) custQ = custQ.eq("business_id", businessId);
    const { data, error } = await custQ.single();
    if (error || !data) { setNotFound(true); setLoading(false); return; }
    setCustomer(data);
    setNotesValue(data.notes ?? "");

    const bid = businessId || data.business_id;
    const [jobRes, estRes, invRes, propRes] = await Promise.all([
      supabase.from("jobs").select("*").eq("business_id", bid).eq("customer_id", custId).order("created_at", { ascending: false }),
      supabase.from("estimates").select("*").eq("business_id", bid).eq("customer_id", custId).order("created_at", { ascending: false }),
      supabase.from("invoices").select("*").eq("business_id", bid).eq("customer_id", custId).order("created_at", { ascending: false }),
      supabase.from("customer_properties").select("*").eq("business_id", bid).eq("customer_id", custId).order("created_at", { ascending: true }),
    ]);
    if (jobRes.data) setJobs(jobRes.data);
    if (estRes.data) setEstimates(estRes.data);
    if (invRes.data) setInvoices(invRes.data);
    if (propRes.data) setProperties(propRes.data.map(rowToProp));
    setLoading(false);
  }

  function rowToProp(row: any): Property {
    return {
      id: row.id,
      label: row.label ?? "Property",
      address: row.address ?? "",
      city: row.city ?? "",
      state: row.state ?? "",
      zip: row.zip ?? "",
      notes: row.notes ?? "",
    };
  }

  // Inline notes save
  async function saveNotes() {
    setSavingNotes(true);
    const { data } = await supabase.from("customers").update({ notes: notesValue.trim() || null }).eq("id", customer.id).select().single();
    setSavingNotes(false);
    if (data) setCustomer(data);
    setEditingNotes(false);
  }

  function startEditingNotes() {
    setEditingNotes(true);
    setTimeout(() => notesRef.current?.focus(), 50);
  }

  // Edit modal
  function openEdit() {
    setEditForm({
      name: customer.name ?? "",
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      address: customer.address ?? "",
      city: customer.city ?? "",
      state: customer.state ?? "",
      zip: customer.zip ?? "",
    });
    setSaveError(null);
    setEditing(true);
  }

  async function handleSave() {
    if (!editForm.name?.trim()) { setSaveError("Name is required."); return; }
    setSaving(true);
    setSaveError(null);
    const { data, error } = await supabase
      .from("customers")
      .update({
        name: editForm.name.trim(),
        phone: editForm.phone.trim() || null,
        email: editForm.email.trim() || null,
        address: editForm.address.trim() || null,
        city: editForm.city.trim() || null,
        state: editForm.state.trim() || null,
        zip: editForm.zip.trim() || null,
      })
      .eq("id", customer.id)
      .select()
      .single();
    setSaving(false);
    if (error) { setSaveError(error.message); return; }
    setCustomer(data);
    setEditing(false);
  }

  const setEdit = (field: string) => (value: string) => setEditForm((f: any) => ({ ...f, [field]: value }));

  // Properties CRUD
  async function addProperty() {
    if (!newProp.address.trim() && !newProp.label.trim()) return;
    setSavingProp(true); setPropertyError("");
    const { data, error } = await supabase.from("customer_properties").insert({
      business_id: businessId,
      customer_id: id,
      label: newProp.label.trim() || "Property",
      address: newProp.address.trim() || null,
      city: newProp.city.trim() || null,
      state: newProp.state.trim() || null,
      zip: newProp.zip.trim() || null,
      notes: newProp.notes.trim() || null,
    }).select().single();
    setSavingProp(false);
    if (error) { setPropertyError(error.message); return; }
    if (data) setProperties((prev) => [...prev, rowToProp(data)]);
    setNewProp(EMPTY_PROPERTY);
    setAddingProperty(false);
  }

  async function updateProperty(propId: string, form: Omit<Property, "id">) {
    setPropertyError("");
    const { data, error } = await supabase.from("customer_properties").update({
      label: form.label || "Property",
      address: form.address || null,
      city: form.city || null,
      state: form.state || null,
      zip: form.zip || null,
      notes: form.notes || null,
    }).eq("id", propId).select().single();
    if (error) { setPropertyError(error.message); return false; }
    if (data) setProperties((prev) => prev.map((p) => p.id === propId ? rowToProp(data) : p));
    return !!data;
  }

  async function deleteProperty(propId: string) {
    setPropertyError("");
    const { error } = await supabase.from("customer_properties").delete().eq("id", propId);
    if (error) { setPropertyError(["23503", "23001"].includes(error.code) ? "This property is linked to jobs and cannot be deleted. Keep it to preserve job history." : error.message); return; }
    setProperties((prev) => prev.filter((p) => p.id !== propId));
  }

  if (loading) return (
    <div className="p-8 flex items-center gap-2 text-ink-quiet">
      <Loader2 className="w-4 h-4 animate-spin" /><span className="text-[14px]">Loading customer…</span>
    </div>
  );

  if (notFound || !customer) return (
    <div className="p-8">
      <Link to="/customers" className="inline-flex items-center gap-1.5 text-[13px] text-ink-quiet hover:text-ink mb-4 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Customers
      </Link>
      <p className="text-[14px] text-ink-quiet">Customer not found.</p>
    </div>
  );

  const totalSpend = sumMoney(invoices, (i) => Number(i.paid_total ?? 0));
  const serviceTypes: string[] = customer.service_types ?? [];

  return (
    <div className="p-8 max-w-4xl">
      <Link to="/customers" className="inline-flex items-center gap-1.5 text-[13px] text-ink-quiet hover:text-ink mb-6 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Customers
      </Link>

      {/* Customer header card */}
      <div className="bg-white rounded-xl border border-paper-deep p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-paper-dark flex items-center justify-center text-[18px] font-semibold text-ink-soft flex-shrink-0">
            {customer.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[20px] font-semibold text-ink">{customer.name}</h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
              {customer.phone && (
                <a
                  href={`tel:${customer.phone}`}
                  className="flex items-center gap-1.5 text-[13px] text-ink-quiet hover:text-accent transition-colors"
                >
                  <Phone className="w-3.5 h-3.5" /> {customer.phone}
                </a>
              )}
              {customer.email && (
                <a
                  href={`mailto:${customer.email}`}
                  className="flex items-center gap-1.5 text-[13px] text-ink-quiet hover:text-accent transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" /> {customer.email}
                </a>
              )}
              {customer.address && (
                <a
                  href={mapsUrl(customer.address, customer.city, customer.state, customer.zip)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[13px] text-ink-quiet hover:text-accent transition-colors"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  {customer.address}{customer.city ? `, ${customer.city}` : ""}{customer.state ? `, ${customer.state}` : ""} {customer.zip ?? ""}
                </a>
              )}
            </div>
            {serviceTypes.length > 0 && (
              <div className="flex gap-2 mt-2">
                {serviceTypes.map((t: string) => (
                  <Badge key={t} variant="default">{serviceLabel(t, services)}</Badge>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <div className="text-right">
              <p className="text-[22px] font-semibold text-ink">${totalSpend.toLocaleString()}</p>
              <p className="text-[12px] text-ink-quiet">total spend</p>
            </div>
            <Button size="sm" variant="secondary" className="w-auto gap-1.5" onClick={openEdit}>
              <Pencil className="w-3.5 h-3.5" /> Edit
            </Button>
          </div>
        </div>

        {/* Inline notes */}
        <div className="mt-4 pt-4 border-t border-paper-deep">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[12px] text-ink-quiet font-medium uppercase tracking-wide">Notes</p>
            {!editingNotes && (
              <button
                onClick={startEditingNotes}
                className="text-[11px] text-ink-quiet hover:text-ink transition-colors flex items-center gap-1"
              >
                <Pencil className="w-3 h-3" /> Edit
              </button>
            )}
          </div>
          {editingNotes ? (
            <div className="space-y-2">
              <textarea
                ref={notesRef}
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                rows={3}
                placeholder="Any notes about this customer…"
                className="w-full px-3 py-2 text-[13px] border border-paper-deep rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={saveNotes}
                  disabled={savingNotes}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-ink text-white hover:bg-ink/80 disabled:opacity-50 transition-colors"
                >
                  {savingNotes ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save
                </button>
                <button
                  onClick={() => { setEditingNotes(false); setNotesValue(customer.notes ?? ""); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-paper-deep bg-white hover:bg-paper-warm transition-colors text-ink"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p
              onClick={startEditingNotes}
              className={cn(
                "text-[13px] cursor-text rounded-lg px-3 py-2 -mx-3 hover:bg-paper-warm transition-colors",
                customer.notes ? "text-ink-soft" : "text-ink-quiet italic"
              )}
            >
              {customer.notes || "Click to add notes…"}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-4 pt-4 border-t border-paper-deep flex-wrap">
          <Button size="sm" className="w-auto gap-1.5" onClick={() => navigate("/jobs", { state: { prefillCustomerId: id } })}>
            <Plus className="w-3.5 h-3.5" /> New Job
          </Button>
          <Button size="sm" variant="secondary" className="w-auto gap-1.5" onClick={() => navigate("/estimates", { state: { prefillCustomerId: id } })}>
            <FileText className="w-3.5 h-3.5" /> New Estimate
          </Button>
          <button
            onClick={openPortal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-paper-deep bg-white text-ink-soft hover:bg-paper-warm transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Preview Portal (as staff)
          </button>
        </div>

        {/* Secure portal access */}
        <div className="mt-4 pt-4 border-t border-paper-deep">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] text-ink-quiet font-medium uppercase tracking-wide">Customer Portal Access</p>
            {portalAccess && !portalAccess.revoked_at && new Date(portalAccess.expires_at) > new Date() && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-[#16a34a] bg-[#f0fdf4] border border-[#bbf7d0] px-2 py-0.5 rounded-full">
                <ShieldCheck className="w-3 h-3" /> Active until {new Date(portalAccess.expires_at).toLocaleDateString()}
              </span>
            )}
            {portalAccess?.revoked_at && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-ink-quiet bg-paper-warm border border-paper-deep px-2 py-0.5 rounded-full">
                <ShieldOff className="w-3 h-3" /> Revoked
              </span>
            )}
          </div>

          {inviteError && (
            <p className="text-[12px] text-[#dc2626] flex items-center gap-1.5 mb-2">
              <AlertCircle className="w-3.5 h-3.5" /> {inviteError}
            </p>
          )}

          {inviteLink ? (
            <div className="bg-paper-warm border border-paper-deep rounded-lg px-3 py-2.5 space-y-2">
              <p className="text-[12px] text-ink-soft">
                One-time sign-in link for <strong>{customer.email}</strong> — copy and send this to the customer yourself (no email is sent automatically).
              </p>
              <div className="flex gap-2">
                <input readOnly value={inviteLink} className="flex-1 px-2.5 py-1.5 text-[12px] border border-paper-deep rounded-lg bg-white text-ink-quiet truncate" />
                <button
                  onClick={copyInviteLink}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-ink text-white hover:bg-ink/80 transition-colors flex-shrink-0"
                >
                  {inviteCopyState === "copied" ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
                  {inviteCopyState === "copied" ? "Copied!" : inviteCopyState === "error" ? "Couldn't copy" : "Copy Link"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={sendPortalInvite}
                disabled={inviteLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-ink text-white hover:bg-ink/80 disabled:opacity-50 transition-colors"
              >
                {inviteLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {portalAccess && !portalAccess.revoked_at ? "Generate New Portal Link" : "Generate Portal Link"}
              </button>
              {portalAccess && !portalAccess.revoked_at && (
                <button
                  onClick={revokePortalAccess}
                  disabled={inviteLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-[#dc2626] border border-[#fecaca] hover:bg-[#fef2f2] disabled:opacity-50 transition-colors"
                >
                  <ShieldOff className="w-3.5 h-3.5" /> Revoke Access
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Edit contact modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditing(false)} />
          <div className="relative bg-white rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-paper-deep">
              <h2 className="text-[16px] font-semibold text-ink">Edit Customer</h2>
              <button onClick={() => setEditing(false)} className="p-1.5 rounded-lg hover:bg-paper-warm text-ink-quiet transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <Field label="Full Name" value={editForm.name} onChange={setEdit("name")} placeholder="Jane Smith" />
              <Field label="Phone" value={editForm.phone} onChange={setEdit("phone")} placeholder="555-000-0000" type="tel" />
              <Field label="Email" value={editForm.email} onChange={setEdit("email")} placeholder="jane@email.com" type="email" />
              <Field label="Street Address" value={editForm.address} onChange={setEdit("address")} placeholder="123 Main St" />
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <Field label="City" value={editForm.city} onChange={setEdit("city")} placeholder="Austin" />
                </div>
                <Field label="State" value={editForm.state} onChange={setEdit("state")} placeholder="TX" />
                <Field label="ZIP" value={editForm.zip} onChange={setEdit("zip")} placeholder="78701" />
              </div>
              {saveError && (
                <div className="bg-[#ffebee] border border-[#ef9a9a] rounded-lg px-4 py-3 text-[13px] text-[#b71c1c]">
                  {saveError}
                </div>
              )}
            </div>
            <div className="flex gap-2 px-6 py-4 border-t border-paper-deep">
              <Button variant="secondary" className="w-auto flex-1" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
              <Button className="flex-1" onClick={handleSave} loading={saving}>Save Changes</Button>
            </div>
          </div>
        </div>
      )}

      {/* Properties section */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold text-ink flex items-center gap-2">
            <Home className="w-4 h-4 text-ink-quiet" /> Properties ({properties.length})
          </h2>
          {!addingProperty && (
            <button
              onClick={() => setAddingProperty(true)}
              className="flex items-center gap-1.5 text-[12px] font-medium text-ink-quiet hover:text-ink transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Property
            </button>
          )}
        </div>

        <div className="space-y-2">
          {propertyError && <p role="alert" className="text-sm text-red-700">{propertyError}</p>}
          {properties.map((prop) => (
            <PropertyCard
              key={prop.id}
              prop={prop}
              onSave={updateProperty}
              onDelete={deleteProperty}
            />
          ))}

          {addingProperty && (
            <div className="border border-paper-deep rounded-xl p-4 bg-white space-y-3">
              <p className="text-[13px] font-semibold text-ink">New Property</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Field label="Label" value={newProp.label} onChange={(v) => setNewProp((p) => ({ ...p, label: v }))} placeholder="Home, Office, Rental…" />
                </div>
                <div className="col-span-2">
                  <Field label="Street Address" value={newProp.address} onChange={(v) => setNewProp((p) => ({ ...p, address: v }))} placeholder="123 Main St" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1"><Field label="City" value={newProp.city} onChange={(v) => setNewProp((p) => ({ ...p, city: v }))} placeholder="Austin" /></div>
                <Field label="State" value={newProp.state} onChange={(v) => setNewProp((p) => ({ ...p, state: v }))} placeholder="TX" />
                <Field label="ZIP" value={newProp.zip} onChange={(v) => setNewProp((p) => ({ ...p, zip: v }))} placeholder="78701" />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1">Notes</label>
                <textarea
                  value={newProp.notes}
                  onChange={(e) => setNewProp((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Gate code, access instructions…"
                  rows={2}
                  className="w-full px-3 py-2 text-[13px] border border-paper-deep rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={addProperty}
                  disabled={savingProp || (!newProp.address.trim() && !newProp.label.trim())}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-ink text-white hover:bg-ink/80 disabled:opacity-50 transition-colors"
                >
                  {savingProp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Add Property
                </button>
                <button
                  onClick={() => { setAddingProperty(false); setNewProp(EMPTY_PROPERTY); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-paper-deep bg-white hover:bg-paper-warm transition-colors text-ink"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {properties.length === 0 && !addingProperty && (
            <button
              onClick={() => setAddingProperty(true)}
              className="w-full border border-dashed border-paper-deep rounded-xl px-4 py-5 text-[13px] text-ink-quiet hover:text-ink hover:border-ink-quiet transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add a service location
            </button>
          )}
        </div>
      </section>

      {/* Jobs */}
      <section className="mb-6">
        <h2 className="text-[15px] font-semibold text-ink mb-3 flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-ink-quiet" /> Jobs ({jobs.length})
        </h2>
        <div className="bg-white rounded-xl border border-paper-deep divide-y divide-paper-deep overflow-hidden">
          {jobs.length === 0 ? (
            <p className="text-[13px] text-ink-quiet px-5 py-4">No jobs yet.</p>
          ) : jobs.map((job) => (
            <Link key={job.id} to={`/jobs/${job.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-paper-warm transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-ink truncate">{job.title}</p>
                <p className="text-[12px] text-ink-quiet">
                  {job.scheduled_date ?? "Not scheduled"}{job.recurring !== "none" ? ` · ${job.recurring}` : ""}
                </p>
              </div>
              <Badge variant={jobStatusBadge(job.status)}>{jobStatusLabel(job.status)}</Badge>
            </Link>
          ))}
        </div>
      </section>

      {/* Estimates */}
      <section className="mb-6">
        <h2 className="text-[15px] font-semibold text-ink mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4 text-ink-quiet" /> Estimates ({estimates.length})
        </h2>
        <div className="bg-white rounded-xl border border-paper-deep divide-y divide-paper-deep overflow-hidden">
          {estimates.length === 0 ? (
            <p className="text-[13px] text-ink-quiet px-5 py-4">No estimates yet.</p>
          ) : estimates.map((est) => (
            <Link key={est.id} to={`/estimates/${est.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-paper-warm transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-ink">Estimate</p>
                <p className="text-[12px] text-ink-quiet">Created {est.created_at?.split("T")[0]}</p>
              </div>
              <p className="text-[13px] font-semibold text-ink mr-3">${Number(est.total).toLocaleString()}</p>
              <Badge variant={estStatusBadge(est.status)}>{estimateStatusLabel(est.status)}</Badge>
            </Link>
          ))}
        </div>
      </section>

      {/* Invoices */}
      <section className="mb-6">
        <h2 className="text-[15px] font-semibold text-ink mb-3 flex items-center gap-2">
          <Receipt className="w-4 h-4 text-ink-quiet" /> Invoices ({invoices.length})
        </h2>
        <div className="bg-white rounded-xl border border-paper-deep divide-y divide-paper-deep overflow-hidden">
          {invoices.length === 0 ? (
            <p className="text-[13px] text-ink-quiet px-5 py-4">No invoices yet.</p>
          ) : invoices.map((inv) => (
            <Link key={inv.id} to={`/invoices/${inv.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-paper-warm transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-ink">Invoice</p>
                <p className="text-[12px] text-ink-quiet">
                  {inv.sent_at ? `Sent ${inv.sent_at.split("T")[0]}` : "Draft"}
                  {inv.due_at ? ` · Due ${inv.due_at}` : ""}
                </p>
              </div>
              <div className="text-right mr-3"><p className="text-[13px] font-semibold text-ink">${Number(inv.total).toFixed(2)}</p><p className="text-[11px] text-ink-quiet">${balanceDue(inv).toFixed(2)} remaining</p></div>
              <Badge variant={invStatusBadge(inv.status)}>{invoiceStatusLabel(inv.status)}</Badge>
            </Link>
          ))}
        </div>
      </section>

      {/* Activity Timeline */}
      {(() => {
        type TimelineEvent = { date: string; label: string; sub: string; icon: React.ElementType; color: string; link: string };
        const events: TimelineEvent[] = [];
        jobs.forEach((j) => {
          if (j.created_at) events.push({ date: j.created_at.split("T")[0], label: `Job created: ${j.title}`, sub: j.status, icon: Briefcase, color: "bg-[#e3f2fd] text-[#1565c0]", link: `/jobs/${j.id}` });
          if (j.scheduled_date) events.push({ date: j.scheduled_date, label: `Job scheduled: ${j.title}`, sub: j.scheduled_time ?? "No time set", icon: Clock, color: "bg-[#e8f5e9] text-[#2e7d32]", link: `/jobs/${j.id}` });
        });
        estimates.forEach((e) => {
          if (e.created_at) events.push({ date: e.created_at.split("T")[0], label: "Estimate created", sub: `$${Number(e.total).toLocaleString()}`, icon: FileText, color: "bg-[#f3e5f5] text-[#6a1b9a]", link: `/estimates/${e.id}` });
          if (e.sent_at) events.push({ date: e.sent_at.split("T")[0], label: "Estimate sent to customer", sub: `$${Number(e.total).toLocaleString()}`, icon: Send, color: "bg-[#fff3e0] text-[#e65100]", link: `/estimates/${e.id}` });
        });
        invoices.forEach((i) => {
          if (i.created_at) events.push({ date: i.created_at.split("T")[0], label: "Invoice created", sub: `$${Number(i.total).toLocaleString()}`, icon: Receipt, color: "bg-paper-warm text-ink-soft", link: `/invoices/${i.id}` });
          if (i.sent_at) events.push({ date: i.sent_at.split("T")[0], label: "Invoice sent", sub: `$${Number(i.total).toLocaleString()} · due ${i.due_at ?? "—"}`, icon: Send, color: "bg-[#fff3e0] text-[#e65100]", link: `/invoices/${i.id}` });
          if (i.paid_at) events.push({ date: i.paid_at.split("T")[0], label: "Invoice paid in full", sub: `$${Number(i.paid_total ?? 0).toLocaleString()} total received`, icon: CheckCircle2, color: "bg-[#e8f5e9] text-[#2e7d32]", link: `/invoices/${i.id}` });
          if (i.status === "overdue") events.push({ date: i.due_at ?? i.created_at?.split("T")[0] ?? "", label: "Invoice overdue", sub: `$${balanceDue(i).toFixed(2)} unpaid`, icon: AlertCircle, color: "bg-[#ffebee] text-[#c62828]", link: `/invoices/${i.id}` });
        });
        const sorted = events.filter((e) => e.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
        if (sorted.length === 0) return null;
        return (
          <section className="mb-6">
            <h2 className="text-[15px] font-semibold text-ink mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-ink-quiet" /> Activity Timeline
            </h2>
            <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
              <div className="divide-y divide-paper-deep">
                {sorted.map((ev, idx) => {
                  const Icon = ev.icon;
                  return (
                    <Link key={idx} to={ev.link} className="flex items-center gap-4 px-5 py-3.5 hover:bg-paper-warm transition-colors">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${ev.color}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-ink">{ev.label}</p>
                        <p className="text-[11px] text-ink-quiet">{ev.sub}</p>
                      </div>
                      <span className="text-[12px] text-ink-quiet flex-shrink-0">{ev.date}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })()}
    </div>
  );
}
