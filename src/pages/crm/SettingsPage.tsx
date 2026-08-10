import { useState, useEffect } from "react";
import { useTheme } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { startConnectOnboarding, refreshConnectStatus } from "@/lib/stripe";
import { openBillingPortal, subscriptionLabel, isSubscriptionActive } from "@/lib/billing";
import { Sun, Moon, Check, CreditCard, ExternalLink, AlertCircle, CheckCircle2, Loader2, RefreshCw, Zap } from "lucide-react";
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

type StripeStatus = "unconnected" | "pending" | "active";

function stripeStatus(business: { stripe_account_id?: string | null; stripe_onboarding_complete?: boolean; stripe_charges_enabled?: boolean } | null): StripeStatus {
  if (!business?.stripe_account_id) return "unconnected";
  if (business.stripe_charges_enabled) return "active";
  return "pending";
}

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { business } = useAuth();
  const businessId = business?.id ?? "";
  const [businessName, setBusinessName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  const [connectStatus, setConnectStatus] = useState<StripeStatus>(() => stripeStatus(business ?? null));
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState("");
  const subStatus = (business as any)?.subscription_status ?? null;
  const subLabel = subscriptionLabel(subStatus);
  const subActive = isSubscriptionActive(subStatus);
  const trialEndsAt = (business as any)?.trial_ends_at as string | null;

  useEffect(() => {
    setConnectStatus(stripeStatus(business ?? null));
  }, [business]);

  // Handle ?stripe=refresh redirect from Stripe when the account link expires
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("stripe") === "refresh") {
      window.history.replaceState({}, "", "/settings");
      handleConnectOnboard();
    }
  }, []);

  useEffect(() => {
    supabase.from("company_settings").select("business_name").eq("id", businessId).single()
      .then(({ data }) => {
        if (data?.business_name) setBusinessName(data.business_name);
      });
  }, [businessId]);

  async function handleConnectOnboard() {
    setConnectLoading(true);
    setConnectError("");
    const { url, error } = await startConnectOnboarding();
    setConnectLoading(false);
    if (error) { setConnectError(error); return; }
    if (url) window.location.href = url;
  }

  async function handleRefreshStatus() {
    if (!businessId) return;
    setRefreshing(true);
    const { charges_enabled, error } = await refreshConnectStatus(businessId);
    setRefreshing(false);
    if (error) { setConnectError(error); return; }
    setConnectStatus(charges_enabled ? "active" : "pending");
  }

  async function handleBillingPortal() {
    setBillingLoading(true);
    setBillingError("");
    const { url, error } = await openBillingPortal();
    setBillingLoading(false);
    if (error) { setBillingError(error); return; }
    if (url) window.location.href = url;
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
          Connect your Stripe account to accept online card payments. Each business keeps their own bank account — funds go directly to you.
        </p>

        <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
          {/* Status bar */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-paper-deep">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-2.5 h-2.5 rounded-full flex-shrink-0",
                connectStatus === "active" ? "bg-[#22c55e]" :
                connectStatus === "pending" ? "bg-[#f59e0b]" : "bg-paper-dark"
              )} />
              <div>
                <p className="text-[14px] font-semibold text-ink">
                  {connectStatus === "active" && "Stripe Connected"}
                  {connectStatus === "pending" && "Stripe — Verification Pending"}
                  {connectStatus === "unconnected" && "Not Connected"}
                </p>
                <p className="text-[12px] text-ink-quiet mt-0.5">
                  {connectStatus === "active" && "You can accept card payments on invoices."}
                  {connectStatus === "pending" && "Your account was created but Stripe needs more info before you can accept payments."}
                  {connectStatus === "unconnected" && "Connect a Stripe account to enable online invoice payments."}
                </p>
              </div>
            </div>
            {connectStatus === "active" && (
              <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#16a34a] bg-[#f0fdf4] border border-[#bbf7d0] px-2.5 py-1 rounded-full">
                <CheckCircle2 className="w-3.5 h-3.5" /> Active
              </span>
            )}
          </div>

          {/* Action area */}
          <div className="px-5 py-4 border-b border-paper-deep">
            {connectStatus === "unconnected" && (
              <button
                onClick={handleConnectOnboard}
                disabled={connectLoading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold bg-[#635bff] text-white hover:bg-[#4f46e5] disabled:opacity-50 transition-colors"
              >
                {connectLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                {connectLoading ? "Redirecting to Stripe…" : "Connect with Stripe"}
              </button>
            )}
            {connectStatus === "pending" && (
              <div className="flex gap-2">
                <button
                  onClick={handleConnectOnboard}
                  disabled={connectLoading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold bg-[#635bff] text-white hover:bg-[#4f46e5] disabled:opacity-50 transition-colors"
                >
                  {connectLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                  {connectLoading ? "Redirecting…" : "Complete Stripe Setup"}
                </button>
                <button
                  onClick={handleRefreshStatus}
                  disabled={refreshing}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold border border-paper-deep text-ink hover:bg-paper-warm disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
                  Refresh Status
                </button>
              </div>
            )}
            {connectStatus === "active" && (
              <button
                onClick={handleRefreshStatus}
                disabled={refreshing}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium border border-paper-deep text-ink-quiet hover:text-ink hover:bg-paper-warm disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
                Refresh
              </button>
            )}
            {connectError && (
              <p className="text-[12px] text-[#dc2626] mt-2 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {connectError}
              </p>
            )}
          </div>

          {/* Setup instructions for admins */}
          <div className="px-5 py-4 bg-[#fffbeb]">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[#d97706] flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[12px] font-semibold text-[#92400e]">Platform setup required (one-time)</p>
                <ol className="text-[12px] text-[#92400e] mt-1.5 space-y-1 list-decimal list-inside">
                  <li>Add <code className="bg-[#fef3c7] px-1 rounded font-mono">STRIPE_SECRET_KEY</code> to Supabase Edge Function secrets</li>
                  <li>Add <code className="bg-[#fef3c7] px-1 rounded font-mono">STRIPE_WEBHOOK_SECRET</code> and <code className="bg-[#fef3c7] px-1 rounded font-mono">APP_URL</code></li>
                  <li>Deploy: <code className="bg-[#fef3c7] px-1 rounded font-mono">supabase functions deploy --all</code></li>
                  <li>Add webhook in Stripe Dashboard pointing to your Supabase functions URL</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-4 h-4 text-ink-quiet" />
          <h2 className="text-[15px] font-semibold text-ink">Subscription</h2>
        </div>
        <p className="text-[13px] text-ink-quiet mb-4">Manage your FieldCRM subscription and billing.</p>

        <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-paper-deep">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-2.5 h-2.5 rounded-full flex-shrink-0",
                subStatus === "active" ? "bg-[#22c55e]" :
                subStatus === "trialing" ? "bg-[#3b82f6]" :
                subStatus === "past_due" ? "bg-[#f59e0b]" : "bg-paper-dark"
              )} />
              <div>
                <p className="text-[14px] font-semibold text-ink">{subLabel}</p>
                {subStatus === "trialing" && trialEndsAt && (
                  <p className="text-[12px] text-ink-quiet mt-0.5">
                    Trial ends {new Date(trialEndsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </p>
                )}
                {subStatus === "past_due" && (
                  <p className="text-[12px] text-[#dc2626] mt-0.5">Payment failed — update your billing info to restore access</p>
                )}
                {!subStatus && (
                  <p className="text-[12px] text-ink-quiet mt-0.5">$49/month · 14-day free trial included</p>
                )}
              </div>
            </div>
            {subActive && (
              <span className={cn(
                "text-[12px] font-semibold px-2.5 py-1 rounded-full border",
                subStatus === "trialing"
                  ? "text-[#1d4ed8] bg-[#eff6ff] border-[#bfdbfe]"
                  : "text-[#16a34a] bg-[#f0fdf4] border-[#bbf7d0]",
              )}>
                {subStatus === "trialing" ? "Trial" : "Active"}
              </span>
            )}
          </div>

          <div className="px-5 py-4">
            {billingError && (
              <p className="text-[12px] text-[#dc2626] mb-3 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {billingError}
              </p>
            )}
            {subActive ? (
              <button
                onClick={handleBillingPortal}
                disabled={billingLoading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold border border-paper-deep text-ink hover:bg-paper-warm disabled:opacity-50 transition-colors"
              >
                {billingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                {billingLoading ? "Opening…" : "Manage Billing"}
              </button>
            ) : (
              <p className="text-[13px] text-ink-quiet">
                You currently don't have an active subscription. You'll see this section once you subscribe.
              </p>
            )}
          </div>
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
