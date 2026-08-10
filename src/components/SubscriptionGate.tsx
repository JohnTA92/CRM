import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { startSubscriptionCheckout, isSubscriptionActive } from "@/lib/billing";
import { Leaf, Loader2, AlertCircle, ArrowRight, Check } from "lucide-react";

const DEV_MODE = import.meta.env.VITE_DEV_MODE === "true";

const PLAN_FEATURES = [
  "Unlimited customers & jobs",
  "Invoices with online payments",
  "Crew management & scheduling",
  "Estimates & expense tracking",
  "Customer & crew portals",
  "Revenue dashboard & reports",
];

export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { business, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper-warm">
        <Loader2 className="w-6 h-6 animate-spin text-ink-quiet" />
      </div>
    );
  }

  const status = (business as any)?.subscription_status ?? null;

  if (DEV_MODE || isSubscriptionActive(status)) {
    return <>{children}</>;
  }

  return <UpgradeWall status={status} />;
}

function UpgradeWall({ status }: { status: string | null }) {
  const { signOut, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isPastDue = status === "past_due";
  const isCancelled = status === "cancelled";

  async function handleSubscribe() {
    setLoading(true);
    setError("");
    const { url, error } = await startSubscriptionCheckout();
    setLoading(false);
    if (error) { setError(error); return; }
    if (url) window.location.href = url;
  }

  return (
    <div className="min-h-screen bg-paper-warm flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl bg-moss flex items-center justify-center">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <span className="text-[20px] font-bold text-ink">FieldCRM</span>
        </div>

        <div className="bg-white rounded-2xl border border-paper-deep shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-7 pt-7 pb-5 border-b border-paper-deep">
            {isPastDue && (
              <div className="flex items-center gap-2 text-[#dc2626] bg-[#fef2f2] border border-[#fecaca] rounded-lg px-3 py-2.5 mb-4">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p className="text-[13px] font-medium">Your last payment failed. Update your billing to restore access.</p>
              </div>
            )}
            {isCancelled && (
              <div className="flex items-center gap-2 text-[#d97706] bg-[#fffbeb] border border-[#fde68a] rounded-lg px-3 py-2.5 mb-4">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p className="text-[13px] font-medium">Your subscription has ended. Resubscribe to continue.</p>
              </div>
            )}
            <h1 className="text-[20px] font-bold text-ink">
              {isPastDue || isCancelled ? "Restore Access" : "Start Your Free Trial"}
            </h1>
            <p className="text-[14px] text-ink-quiet mt-1.5">
              {isPastDue || isCancelled
                ? "Subscribe to get back into your account."
                : "14 days free, then $49/month. Cancel anytime."}
            </p>
          </div>

          {/* Features */}
          <div className="px-7 py-5 border-b border-paper-deep">
            <p className="text-[12px] font-semibold text-ink-quiet uppercase tracking-wide mb-3">Everything included</p>
            <ul className="space-y-2.5">
              {PLAN_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2.5">
                  <div className="w-4.5 h-4.5 rounded-full bg-[#f0fdf4] border border-[#86efac] flex items-center justify-center flex-shrink-0">
                    <Check className="w-2.5 h-2.5 text-[#16a34a]" />
                  </div>
                  <span className="text-[13px] text-ink">{f}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Pricing + CTA */}
          <div className="px-7 py-5">
            <div className="flex items-baseline gap-1.5 mb-4">
              <span className="text-[32px] font-bold text-ink">$49</span>
              <span className="text-[14px] text-ink-quiet">/month</span>
              {!isPastDue && !isCancelled && (
                <span className="ml-2 text-[12px] font-semibold text-[#16a34a] bg-[#f0fdf4] border border-[#86efac] px-2 py-0.5 rounded-full">
                  14-day free trial
                </span>
              )}
            </div>

            {error && (
              <p className="text-[12px] text-[#dc2626] mb-3 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {error}
              </p>
            )}

            <button
              onClick={handleSubscribe}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[14px] font-semibold bg-ink text-white hover:bg-ink/80 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting to checkout…</>
              ) : (
                <>Start Free Trial <ArrowRight className="w-4 h-4" /></>
              )}
            </button>

            <p className="text-center text-[11px] text-ink-quiet mt-3">
              Signed in as {user?.email} ·{" "}
              <button onClick={() => signOut()} className="underline hover:text-ink transition-colors">
                Sign out
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
