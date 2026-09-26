import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/design-system/primitives/Badge";
import { Button } from "@/design-system/primitives/Button";
import { type Customer } from "@/data/crm";
import { useServices, serviceLabel } from "@/lib/services";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { matchesCustomerQuery, findDuplicateGroups } from "@/lib/customerMatching";
import {
  Search, Plus, ChevronRight, MapPin, Phone, Mail, X, User, Loader2,
  CopyCheck, ChevronDown, ChevronUp, Tag,
} from "lucide-react";

interface CustomerMeta {
  totalSpend: number;
  lastActivity: string | null;
}

function serviceTypeBadge(type: string) {
  const map: Record<string, "success" | "default" | "accent" | "gold"> = {
    lawn: "success",
    "pressure-washing": "accent",
    "window-cleaning": "default",
    custom: "gold",
  };
  return map[type] ?? "default";
}

interface FormState {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

const EMPTY_FORM: FormState = {
  firstName: "", lastName: "", phone: "", email: "",
  address: "", city: "", state: "", zip: "",
};

function Field({
  label, value, onChange, placeholder, type = "text", required, error,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; required?: boolean; error?: string;
}) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">
        {label}{required && <span className="text-accent ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-2.5 text-[14px] border rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none transition-colors ${
          error ? "border-accent" : "border-paper-deep focus:border-ink"
        }`}
      />
      {error && <p className="text-[11px] text-accent mt-1">{error}</p>}
    </div>
  );
}

/**
 * Non-destructive duplicate review. Surfaces records that look like the same person and
 * says exactly why, then links out so a person can decide. Nothing here merges, deletes
 * or archives — resolving a duplicate is a manual edit on the customer record.
 */
function DuplicateReview({ groups }: { groups: ReturnType<typeof findDuplicateGroups> }) {
  const [open, setOpen] = useState(false);
  const count = groups.length;

  return (
    <div className="bg-white rounded-xl border border-paper-deep mb-5 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-paper-warm transition-colors text-left"
      >
        <CopyCheck className="w-4 h-4 text-ink-quiet flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-ink">
            {count} possible duplicate{count !== 1 ? "s" : ""}
          </p>
          <p className="text-[12px] text-ink-quiet">
            Review and resolve manually — nothing is merged or deleted automatically.
          </p>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-ink-quiet flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-ink-quiet flex-shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-paper-deep divide-y divide-paper-deep">
          {groups.map((group) => (
            <div key={group.key} className="px-5 py-3.5">
              <Badge variant="warning" className="mb-2">{group.label}</Badge>
              <div className="space-y-1.5">
                {group.customers.map((c) => (
                  <Link
                    key={c.id}
                    to={`/customers/${c.id}`}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 -mx-3 hover:bg-paper-warm transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-ink truncate">{c.name || "Unnamed customer"}</p>
                      <p className="text-[12px] text-ink-quiet truncate">
                        {[c.phone, c.email, c.address].filter(Boolean).join(" · ") || "No contact details"}
                      </p>
                    </div>
                    <ChevronRight className="hidden sm:block w-4 h-4 text-ink-quiet opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CustomersPage() {
  const { services } = useServices();
  const { business, loading: authLoading } = useAuth();
  const businessId = business?.id ?? "";
  const [customerList, setCustomerList] = useState<Customer[]>([]);
  const [activeJobCounts, setActiveJobCounts] = useState<Record<string, number>>({});
  const [customerMeta, setCustomerMeta] = useState<Record<string, CustomerMeta>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<FormState>>({});

  useEffect(() => {
    if (businessId || !authLoading) loadCustomers();
  }, [businessId, authLoading]);

  async function loadCustomers() {
    setLoading(true);
    // Only filter by business_id for a real, authenticated tenant. With no session
    // (e.g. the dev-mode bypass) there is no business_id to filter on — an empty
    // string is not a valid uuid and Postgres rejects it, which previously made every
    // one of these queries error out silently and left the list empty.
    let custQ = supabase.from("customers").select("*").eq("archived", false).order("created_at", { ascending: false });
    let jobQ = supabase.from("jobs").select("customer_id, status, created_at, scheduled_date");
    let invQ = supabase.from("invoices").select("customer_id, status, total, created_at, paid_at");
    if (businessId) {
      custQ = custQ.eq("business_id", businessId);
      jobQ = jobQ.eq("business_id", businessId);
      invQ = invQ.eq("business_id", businessId);
    }
    const [custRes, jobRes, invRes] = await Promise.all([custQ, jobQ, invQ]);
    if (!custRes.error && custRes.data) {
      setCustomerList(custRes.data.map(rowToCustomer));
    }
    if (jobRes.data) {
      const counts: Record<string, number> = {};
      for (const j of jobRes.data) {
        if (["scheduled", "in-progress", "quoted"].includes(j.status)) {
          counts[j.customer_id] = (counts[j.customer_id] ?? 0) + 1;
        }
      }
      setActiveJobCounts(counts);
    }
    // Compute per-customer spend + last activity
    if (invRes.data && jobRes.data) {
      const meta: Record<string, CustomerMeta> = {};
      for (const inv of invRes.data) {
        if (!meta[inv.customer_id]) meta[inv.customer_id] = { totalSpend: 0, lastActivity: null };
        if (inv.status === "paid") meta[inv.customer_id].totalSpend += Number(inv.total ?? 0);
        const actDate = inv.paid_at ?? inv.created_at;
        if (actDate && (!meta[inv.customer_id].lastActivity || actDate > meta[inv.customer_id].lastActivity!)) {
          meta[inv.customer_id].lastActivity = actDate.split("T")[0];
        }
      }
      for (const job of jobRes.data) {
        const actDate = job.scheduled_date ?? job.created_at;
        if (!actDate) continue;
        const d = actDate.split("T")[0];
        if (!meta[job.customer_id]) meta[job.customer_id] = { totalSpend: 0, lastActivity: null };
        if (!meta[job.customer_id].lastActivity || d > meta[job.customer_id].lastActivity!) {
          meta[job.customer_id].lastActivity = d;
        }
      }
      setCustomerMeta(meta);
    }
    setLoading(false);
  }

  function rowToCustomer(row: any): Customer {
    return {
      id: row.id,
      name: row.name,
      email: row.email ?? "",
      phone: row.phone ?? "",
      address: row.address ?? "",
      city: row.city ?? "",
      state: row.state ?? "",
      zip: row.zip ?? "",
      serviceTypes: row.service_types ?? [],
      // Reads as undefined until the customer_tags migration is applied; an empty
      // array keeps the list rendering normally in the meantime.
      tags: row.tags ?? [],
      notes: row.notes ?? "",
      createdAt: row.created_at?.split("T")[0] ?? "",
      archived: row.archived ?? false,
    };
  }

  const set = (field: keyof FormState) => (value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const validate = () => {
    const e: Partial<FormState> = {};
    if (!form.firstName.trim()) e.firstName = "Required";
    if (!form.lastName.trim()) e.lastName = "Required";
    if (!form.phone.trim()) e.phone = "Required";
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }


    setSaving(true);
    setSaveError(null);

    console.log("Inserting customer with business_id:", businessId);

    const { data, error } = await supabase
      .from("customers")
      .insert({
        business_id: businessId || null,
        name: `${form.firstName.trim()} ${form.lastName.trim()}`,
        email: form.email.trim() || null,
        phone: form.phone.trim(),
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        zip: form.zip.trim() || null,
        service_types: [],
        notes: null,
        archived: false,
      })
      .select()
      .single();

    setSaving(false);

    if (error) {
      console.error("Supabase insert error:", error);
      setSaveError(error.message + (error.details ? ` — ${error.details}` : "") + (error.hint ? ` (${error.hint})` : ""));
      return;
    }

    if (data) {
      setCustomerList((prev) => [rowToCustomer(data), ...prev]);
    }

    setForm(EMPTY_FORM);
    setErrors({});
    setShowModal(false);
  };

  const handleClose = () => {
    setShowModal(false);
    setForm(EMPTY_FORM);
    setErrors({});
    setSaveError(null);
  };

  // Normalization-aware: formatted and unformatted phone numbers both match, name
  // tokens may be typed in any order, and tags are searchable. See lib/customerMatching.
  const filtered = customerList.filter((c) => matchesCustomerQuery(c, query));

  // Identification only — never merges, deletes or archives anything.
  const duplicateGroups = useMemo(() => findDuplicateGroups(customerList), [customerList]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-[22px] font-semibold text-ink">Customers</h1>
          <p className="text-[14px] text-ink-quiet mt-1">
            {loading ? "Loading…" : `${customerList.length} active customer${customerList.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button size="sm" className="w-auto gap-1.5" onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4" /> Add Customer
        </Button>
      </div>

      <div className="mb-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-quiet" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, phone, email, address, or tag…"
            className="w-full pl-9 pr-4 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors"
          />
        </div>
      </div>

      {!loading && duplicateGroups.length > 0 && <DuplicateReview groups={duplicateGroups} />}

      <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
        {loading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-ink-quiet">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-[14px]">Loading customers…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <User className="w-8 h-8 text-ink-quiet mx-auto mb-3" />
            <p className="text-[14px] text-ink-quiet">
              {query ? "No customers match your search." : "No customers yet. Add your first one."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-paper-deep">
            {filtered.map((customer) => {
              const activeCount = activeJobCounts[customer.id] ?? 0;
              const meta = customerMeta[customer.id];
              const mapsUrl = customer.address
                ? `https://maps.google.com/?q=${encodeURIComponent([customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(", "))}`
                : null;

              return (
                <Link
                  key={customer.id}
                  to={`/customers/${customer.id}`}
                  className="grid grid-cols-[40px_minmax(0,1fr)] sm:flex items-center gap-4 px-5 py-4 hover:bg-paper-warm transition-colors group"
                >
                  <div className="w-10 h-10 rounded-full bg-paper-dark flex items-center justify-center text-[13px] font-semibold text-ink-soft flex-shrink-0">
                    {customer.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-ink">{customer.name}</p>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {mapsUrl && (
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex min-w-0 break-all items-center gap-1 text-[12px] text-ink-quiet hover:text-accent transition-colors"
                        >
                          <MapPin className="w-3 h-3" /> {customer.address}{customer.city ? `, ${customer.city}` : ""}
                        </a>
                      )}
                      {customer.phone && (
                        <a
                          href={`tel:${customer.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex min-w-0 break-all items-center gap-1 text-[12px] text-ink-quiet hover:text-accent transition-colors"
                        >
                          <Phone className="w-3 h-3" /> {customer.phone}
                        </a>
                      )}
                      {customer.email && (
                        <a
                          href={`mailto:${customer.email}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex min-w-0 break-all items-center gap-1 text-[12px] text-ink-quiet hover:text-accent transition-colors"
                        >
                          <Mail className="w-3 h-3" /> {customer.email}
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2 flex flex-wrap sm:flex-col items-start sm:items-end gap-1 sm:flex-shrink-0 sm:min-w-[80px] sm:max-w-[220px]">
                    {meta?.totalSpend ? (
                      <span className="text-[13px] font-semibold text-ink">${meta.totalSpend.toLocaleString()}</span>
                    ) : null}
                    {meta?.lastActivity ? (
                      <span className="text-[11px] text-ink-quiet">{meta.lastActivity}</span>
                    ) : null}
                    {activeCount > 0 && (
                      <span className="text-[11px] text-ink-quiet">{activeCount} active job{activeCount > 1 ? "s" : ""}</span>
                    )}
                    {customer.serviceTypes.map((t) => (
                      <Badge key={t} variant={serviceTypeBadge(t)}>{serviceLabel(t, services)}</Badge>
                    ))}
                    {customer.tags.map((t) => (
                      <Badge key={`tag-${t}`} variant="muted" className="gap-1 max-w-full whitespace-normal break-all">
                        <Tag className="w-2.5 h-2.5" /> {t}
                      </Badge>
                    ))}
                  </div>
                  <ChevronRight className="hidden sm:block w-4 h-4 text-ink-quiet opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Customer Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
          <div className="relative bg-white rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-paper-deep">
              <h2 className="text-[16px] font-semibold text-ink">Add Customer</h2>
              <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-paper-warm transition-colors text-ink-quiet">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="First Name" value={form.firstName} onChange={set("firstName")} placeholder="Jane" required error={errors.firstName} />
                <Field label="Last Name" value={form.lastName} onChange={set("lastName")} placeholder="Smith" required error={errors.lastName} />
              </div>
              <Field label="Phone Number" value={form.phone} onChange={set("phone")} placeholder="555-000-0000" type="tel" required error={errors.phone} />
              <Field label="Email" value={form.email} onChange={set("email")} placeholder="jane@email.com" type="email" />
              <Field label="Street Address" value={form.address} onChange={set("address")} placeholder="123 Main St" />
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <Field label="City" value={form.city} onChange={set("city")} placeholder="Austin" />
                </div>
                <Field label="State" value={form.state} onChange={set("state")} placeholder="TX" />
                <Field label="ZIP" value={form.zip} onChange={set("zip")} placeholder="78701" />
              </div>

              {saveError && (
                <div className="bg-[#ffebee] border border-[#ef9a9a] rounded-lg px-4 py-3 text-[13px] text-[#b71c1c]">
                  {saveError}
                </div>
              )}
            </div>

            <div className="flex gap-2 px-6 py-4 border-t border-paper-deep">
              <Button variant="secondary" className="w-auto flex-1" onClick={handleClose} disabled={saving}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleSubmit} loading={saving}>
                Save Customer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
