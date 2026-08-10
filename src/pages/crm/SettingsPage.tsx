import { useState, useEffect } from "react";
import { useTheme } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Sun, Moon, Check, CreditCard, ExternalLink, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

function ThemeOption({
  value,
  current,
  icon: Icon,
  label,
  description,
  onClick,
}: {
  value: "light" | "dark";
  current: "light" | "dark";
  icon: React.ElementType;
  label: string;
  description: string;
  onClick: () => void;
}) {
  const active = current === value;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-start gap-4 w-full text-left px-5 py-4 rounded-xl border-2 transition-all duration-150",
        active
          ? "border-accent bg-accent/5"
          : "border-paper-deep bg-white hover:border-ink/30 hover:bg-paper-warm",
      )}
    >
      <div className={cn(
        "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
        active ? "bg-accent text-white" : "bg-paper-warm text-ink-soft",
      )}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className={cn("text-[14px] font-semibold", active ? "text-accent" : "text-ink")}>{label}</p>
        <p className="text-[13px] text-ink-quiet mt-0.5">{description}</p>
      </div>
      <div className={cn(
        "ml-auto mt-1 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center",
        active ? "border-accent" : "border-paper-deep",
      )}>
        {active && <div className="w-2 h-2 rounded-full bg-accent" />}
      </div>
    </button>
  );
}

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { business } = useAuth();
  const businessId = business?.id ?? "";
  const [businessName, setBusinessName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [stripePubKey, setStripePubKey] = useState("");
  const [savingStripe, setSavingStripe] = useState(false);
  const [stripeSaved, setStripeSaved] = useState(false);

  useEffect(() => {
    supabase.from("company_settings").select("business_name, stripe_enabled, stripe_publishable_key").eq("id", businessId).single()
      .then(({ data }) => {
        if (data?.business_name) setBusinessName(data.business_name);
        if (data?.stripe_enabled) setStripeEnabled(data.stripe_enabled);
        if (data?.stripe_publishable_key) setStripePubKey(data.stripe_publishable_key);
      });
  }, [businessId]);

  async function saveStripe() {
    setSavingStripe(true);
    await supabase.from("company_settings").upsert({
      id: businessId,
      stripe_enabled: stripeEnabled,
      stripe_publishable_key: stripePubKey.trim() || null,
    });
    setSavingStripe(false);
    setStripeSaved(true);
    setTimeout(() => setStripeSaved(false), 2000);
  }

  async function saveBusinessName() {
    if (!businessName.trim()) return;
    setSavingName(true);
    await supabase.from("company_settings").upsert({ id: businessId, business_name: businessName.trim() });
    setSavingName(false);
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 2000);
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-ink">Settings</h1>
        <p className="text-[14px] text-ink-quiet mt-1">Manage your app preferences.</p>
      </div>

      <section className="mb-8">
        <h2 className="text-[15px] font-semibold text-ink mb-1">Business</h2>
        <p className="text-[13px] text-ink-quiet mb-4">This name appears in the sidebar and customer portals.</p>
        <div className="flex gap-2">
          <input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveBusinessName(); }}
            placeholder="e.g. Green Thumb Lawn Care"
            className="flex-1 px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors"
          />
          <button
            onClick={saveBusinessName}
            disabled={savingName || !businessName.trim()}
            className="px-4 py-2.5 rounded-lg text-[13px] font-semibold bg-ink text-white hover:bg-ink/80 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {nameSaved ? <><Check className="w-3.5 h-3.5" /> Saved</> : savingName ? "Saving…" : "Save"}
          </button>
        </div>
      </section>

      <section className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <CreditCard className="w-4 h-4 text-ink-quiet" />
          <h2 className="text-[15px] font-semibold text-ink">Payments</h2>
        </div>
        <p className="text-[13px] text-ink-quiet mb-4">
          Accept online card payments via Stripe. Customers can pay invoices directly from their portal.
        </p>

        <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
          {/* Enable toggle */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-paper-deep">
            <div>
              <p className="text-[14px] font-semibold text-ink">Enable Stripe Payments</p>
              <p className="text-[12px] text-ink-quiet mt-0.5">Show "Pay Online" button on invoices and customer portal</p>
            </div>
            <button
              onClick={() => setStripeEnabled((v) => !v)}
              className={cn(
                "relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0",
                stripeEnabled ? "bg-moss" : "bg-paper-dark"
              )}
            >
              <span className={cn(
                "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200",
                stripeEnabled ? "translate-x-5" : "translate-x-0.5"
              )} />
            </button>
          </div>

          {/* Publishable key */}
          <div className="px-5 py-4 border-b border-paper-deep">
            <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">
              Stripe Publishable Key
            </label>
            <input
              value={stripePubKey}
              onChange={(e) => setStripePubKey(e.target.value)}
              placeholder="pk_live_… or pk_test_…"
              className="w-full px-3 py-2.5 text-[13px] font-mono border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors"
            />
            <p className="text-[11px] text-ink-quiet mt-1.5">
              Find this in your{" "}
              <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer"
                className="text-accent hover:underline inline-flex items-center gap-0.5">
                Stripe Dashboard <ExternalLink className="w-3 h-3" />
              </a>
              {" "}under Developers → API keys.
            </p>
          </div>

          {/* Secret key instructions */}
          <div className="px-5 py-4 bg-[#fffbeb] border-b border-paper-deep">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[#d97706] flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[12px] font-semibold text-[#92400e]">Secret key goes in Supabase, not here</p>
                <p className="text-[12px] text-[#92400e] mt-1">
                  For security, your Stripe secret key must be added as a Supabase secret:
                </p>
                <ol className="text-[12px] text-[#92400e] mt-2 space-y-1 list-decimal list-inside">
                  <li>Go to Supabase Dashboard → Edge Functions → Secrets</li>
                  <li>Add <code className="bg-[#fef3c7] px-1 rounded font-mono">STRIPE_SECRET_KEY</code> = your <code className="bg-[#fef3c7] px-1 rounded font-mono">sk_live_…</code> key</li>
                  <li>Add <code className="bg-[#fef3c7] px-1 rounded font-mono">STRIPE_WEBHOOK_SECRET</code> = your webhook signing secret</li>
                  <li>Add <code className="bg-[#fef3c7] px-1 rounded font-mono">APP_URL</code> = your app's public URL</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Webhook instructions */}
          <div className="px-5 py-4 bg-paper-warm border-b border-paper-deep">
            <p className="text-[12px] font-semibold text-ink mb-1.5">Webhook setup (for automatic paid status)</p>
            <p className="text-[12px] text-ink-quiet mb-2">
              In Stripe Dashboard → Developers → Webhooks, add an endpoint:
            </p>
            <code className="block text-[11px] font-mono bg-white border border-paper-deep rounded-lg px-3 py-2 text-ink break-all">
              https://ekfnjswozausgebvbwew.supabase.co/functions/v1/stripe-webhook
            </code>
            <p className="text-[11px] text-ink-quiet mt-1.5">Listen for: <code className="font-mono">checkout.session.completed</code></p>
          </div>

          {/* Deploy instructions */}
          <div className="px-5 py-4 bg-paper-warm">
            <p className="text-[12px] font-semibold text-ink mb-1.5">Deploy the Edge Functions</p>
            <p className="text-[12px] text-ink-quiet mb-2">Run these once in your project terminal:</p>
            <code className="block text-[11px] font-mono bg-white border border-paper-deep rounded-lg px-3 py-2 text-ink">
              npx supabase functions deploy create-payment-session{"\n"}
              npx supabase functions deploy stripe-webhook
            </code>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4">
          {stripeEnabled && stripePubKey.startsWith("pk_") ? (
            <span className="flex items-center gap-1.5 text-[12px] text-[#2e7d32] font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> Ready — payments will show on invoices
            </span>
          ) : (
            <span className="text-[12px] text-ink-quiet">
              {stripeEnabled ? "Enter a valid publishable key to activate" : "Payments are disabled"}
            </span>
          )}
          <button
            onClick={saveStripe}
            disabled={savingStripe}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-ink text-white hover:bg-ink/80 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {stripeSaved ? <><Check className="w-3.5 h-3.5" /> Saved</> : savingStripe ? "Saving…" : "Save"}
          </button>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-[15px] font-semibold text-ink mb-1">Appearance</h2>
        <p className="text-[13px] text-ink-quiet mb-4">Choose how the app looks. Your preference is saved in your browser.</p>
        <div className="space-y-3">
          <ThemeOption
            value="light"
            current={theme}
            icon={Sun}
            label="Light"
            description="White background, dark text. Best for bright environments."
            onClick={() => setTheme("light")}
          />
          <ThemeOption
            value="dark"
            current={theme}
            icon={Moon}
            label="Dark"
            description="Dark background, light text. Easier on the eyes at night."
            onClick={() => setTheme("dark")}
          />
        </div>
      </section>

      <section className="bg-white rounded-xl border border-paper-deep overflow-hidden">
        <div className="px-5 py-4 border-b border-paper-deep bg-paper-warm">
          <h2 className="text-[14px] font-semibold text-ink">About</h2>
        </div>
        <div className="divide-y divide-paper-deep">
          {[
            { label: "App", value: "Field Service CRM" },
            { label: "Version", value: "0.1.0" },
            { label: "Services", value: "Lawn Care · Pressure Washing · Window Cleaning" },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between px-5 py-3.5">
              <p className="text-[13px] text-ink-quiet">{label}</p>
              <p className="text-[13px] text-ink font-medium">{value}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
