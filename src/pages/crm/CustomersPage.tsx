import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/design-system/primitives/Badge";
import { Button } from "@/design-system/primitives/Button";
import { getJobsForCustomer, type Customer } from "@/data/crm";
import { useServices, serviceLabel } from "@/lib/services";
import { supabase } from "@/lib/supabase";
import { Search, Plus, ChevronRight, MapPin, Phone, Mail, X, User, Loader2 } from "lucide-react";

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

export function CustomersPage() {
  const { services } = useServices();
  const [customerList, setCustomerList] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<FormState>>({});

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("archived", false)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setCustomerList(data.map(rowToCustomer));
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

    const { data, error } = await supabase
      .from("customers")
      .insert({
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
      setSaveError(error.message);
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

  const filtered = customerList.filter(
    (c) =>
      query === "" ||
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.email.toLowerCase().includes(query.toLowerCase()) ||
      c.address.toLowerCase().includes(query.toLowerCase()),
  );

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
            placeholder="Search by name, email, or address…"
            className="w-full pl-9 pr-4 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors"
          />
        </div>
      </div>

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
              const customerJobs = getJobsForCustomer(customer.id);
              const activeCount = customerJobs.filter((j) =>
                ["scheduled", "in-progress", "quoted"].includes(j.status),
              ).length;

              return (
                <Link
                  key={customer.id}
                  to={`/customers/${customer.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-paper-warm transition-colors group"
                >
                  <div className="w-10 h-10 rounded-full bg-paper-dark flex items-center justify-center text-[13px] font-semibold text-ink-soft flex-shrink-0">
                    {customer.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-ink">{customer.name}</p>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {customer.address && (
                        <span className="flex items-center gap-1 text-[12px] text-ink-quiet">
                          <MapPin className="w-3 h-3" /> {customer.address}{customer.city ? `, ${customer.city}` : ""}
                        </span>
                      )}
                      {customer.phone && (
                        <span className="flex items-center gap-1 text-[12px] text-ink-quiet">
                          <Phone className="w-3 h-3" /> {customer.phone}
                        </span>
                      )}
                      {customer.email && (
                        <span className="flex items-center gap-1 text-[12px] text-ink-quiet">
                          <Mail className="w-3 h-3" /> {customer.email}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {customer.serviceTypes.map((t) => (
                      <Badge key={t} variant={serviceTypeBadge(t)}>{serviceLabel(t, services)}</Badge>
                    ))}
                    {activeCount > 0 && (
                      <span className="text-[12px] text-ink-quiet ml-1">{activeCount} active job{activeCount > 1 ? "s" : ""}</span>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-ink-quiet opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
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
