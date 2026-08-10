import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { startConnectOnboarding } from "@/lib/stripe";
import {
  Leaf, ArrowRight, ArrowLeft, Check, Loader2,
  Building2, Wrench, CreditCard, PartyPopper, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["welcome", "profile", "service", "stripe", "done"] as const;
type Step = typeof STEPS[number];

function ProgressDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={cn(
            "rounded-full transition-all duration-300",
            i < current ? "w-2 h-2 bg-moss" :
            i === current ? "w-6 h-2 bg-moss" :
            "w-2 h-2 bg-paper-dark"
          )}
        />
      ))}
    </div>
  );
}

export function OnboardingWizard() {
  const { business } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("welcome");
  const [completing, setCompleting] = useState(false);

  // Profile step
  const [bizName, setBizName] = useState(business?.name ?? "");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Service step
  const [serviceName, setServiceName] = useState("");
  const [servicePrice, setServicePrice] = useState("");
  const [savingService, setSavingService] = useState(false);
  const [serviceAdded, setServiceAdded] = useState(false);

  // Stripe step
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectError, setConnectError] = useState("");

  const stepIndex = STEPS.indexOf(step);
  const dotIndex = Math.min(stepIndex, 4); // map to 1-4 for dots

  async function completeOnboarding() {
    if (!business?.id) return;
    setCompleting(true);
    await supabase.from("businesses").update({ onboarding_complete: true }).eq("id", business.id);
    setCompleting(false);
    navigate("/", { replace: true });
  }

  async function saveProfile() {
    if (!bizName.trim() || !business?.id) return;
    setSavingProfile(true);
    await Promise.all([
      supabase.from("businesses").update({ name: bizName.trim() }).eq("id", business.id),
      supabase.from("company_settings").upsert({
        id: business.id,
        business_name: bizName.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
      }),
    ]);
    setSavingProfile(false);
    setStep("service");
  }

  async function saveService() {
    if (!serviceName.trim() || !business?.id) return;
    setSavingService(true);
    await supabase.from("services").insert({
      business_id: business.id,
      name: serviceName.trim(),
      price: parseFloat(servicePrice) || null,
      unit: "job",
    });
    setSavingService(false);
    setServiceAdded(true);
    setTimeout(() => setStep("stripe"), 800);
  }

  async function handleConnectStripe() {
    setConnectLoading(true);
    setConnectError("");
    const { url, error } = await startConnectOnboarding();
    setConnectLoading(false);
    if (error) { setConnectError(error); return; }
    if (url) window.location.href = url;
  }

  return (
    <div className="min-h-screen bg-paper-warm flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl bg-moss flex items-center justify-center">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <span className="text-[20px] font-bold text-ink">FieldCRM</span>
        </div>

        {step === "welcome" && (
          <div className="bg-white rounded-2xl border border-paper-deep shadow-sm overflow-hidden">
            <div className="px-8 py-10 text-center">
              <div className="w-16 h-16 rounded-2xl bg-moss/10 flex items-center justify-center mx-auto mb-5">
                <Leaf className="w-8 h-8 text-moss" />
              </div>
              <h1 className="text-[22px] font-bold text-ink">Welcome to FieldCRM</h1>
              <p className="text-[14px] text-ink-quiet mt-2 max-w-sm mx-auto">
                Let's get your account set up in about 2 minutes. We'll walk you through the basics so you can start managing jobs right away.
              </p>

              <div className="grid grid-cols-3 gap-3 mt-7 mb-8">
                {[
                  { icon: Building2, label: "Business profile", desc: "Name & contact info" },
                  { icon: Wrench, label: "First service", desc: "What you offer" },
                  { icon: CreditCard, label: "Get paid online", desc: "Connect Stripe" },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="bg-paper-warm rounded-xl p-3.5 text-center">
                    <div className="w-8 h-8 rounded-lg bg-white border border-paper-deep flex items-center justify-center mx-auto mb-2">
                      <Icon className="w-4 h-4 text-ink-quiet" />
                    </div>
                    <p className="text-[12px] font-semibold text-ink">{label}</p>
                    <p className="text-[11px] text-ink-quiet mt-0.5">{desc}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setStep("profile")}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[14px] font-semibold bg-ink text-white hover:bg-ink/80 transition-colors"
              >
                Get Started <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={completeOnboarding}
                disabled={completing}
                className="mt-3 text-[13px] text-ink-quiet hover:text-ink transition-colors underline"
              >
                Skip setup, go to dashboard
              </button>
            </div>
          </div>
        )}

        {step === "profile" && (
          <div className="bg-white rounded-2xl border border-paper-deep shadow-sm overflow-hidden">
            <div className="px-7 pt-7 pb-5 border-b border-paper-deep">
              <div className="flex items-center justify-between mb-1">
                <ProgressDots current={1} />
                <button onClick={completeOnboarding} className="text-ink-quiet hover:text-ink transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <h2 className="text-[18px] font-bold text-ink mt-4">Your business profile</h2>
              <p className="text-[13px] text-ink-quiet mt-1">This appears in your customer portals and invoices.</p>
            </div>

            <div className="px-7 py-6 space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Business name <span className="text-[#dc2626]">*</span></label>
                <input
                  value={bizName}
                  onChange={(e) => setBizName(e.target.value)}
                  placeholder="e.g. Green Thumb Lawn Care"
                  className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Phone number</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  type="tel"
                  className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Business address</label>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Main St, City, ST 12345"
                  className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors"
                />
              </div>
            </div>

            <div className="px-7 pb-7 flex items-center gap-3">
              <button
                onClick={() => setStep("welcome")}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[13px] font-semibold border border-paper-deep text-ink hover:bg-paper-warm transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <button
                onClick={saveProfile}
                disabled={savingProfile || !bizName.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold bg-ink text-white hover:bg-ink/80 disabled:opacity-50 transition-colors"
              >
                {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {savingProfile ? "Saving…" : "Save & Continue"}
                {!savingProfile && <ArrowRight className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        )}

        {step === "service" && (
          <div className="bg-white rounded-2xl border border-paper-deep shadow-sm overflow-hidden">
            <div className="px-7 pt-7 pb-5 border-b border-paper-deep">
              <div className="flex items-center justify-between mb-1">
                <ProgressDots current={2} />
                <button onClick={completeOnboarding} className="text-ink-quiet hover:text-ink transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <h2 className="text-[18px] font-bold text-ink mt-4">Add your first service</h2>
              <p className="text-[13px] text-ink-quiet mt-1">Services are what you sell — you can add more later.</p>
            </div>

            <div className="px-7 py-6 space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Service name <span className="text-[#dc2626]">*</span></label>
                <input
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  placeholder="e.g. Lawn Mowing, Pressure Washing"
                  className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Default price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-ink-quiet">$</span>
                  <input
                    value={servicePrice}
                    onChange={(e) => setServicePrice(e.target.value)}
                    placeholder="75.00"
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full pl-7 pr-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors"
                  />
                </div>
              </div>

              {/* Quick-pick suggestions */}
              <div>
                <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide mb-2">Common services</p>
                <div className="flex flex-wrap gap-2">
                  {["Lawn Mowing", "Pressure Washing", "Window Cleaning", "Snow Removal", "Landscaping", "Gutter Cleaning"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setServiceName(s)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors",
                        serviceName === s
                          ? "bg-ink text-white border-ink"
                          : "bg-white border-paper-deep text-ink hover:border-ink/40"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-7 pb-7 flex items-center gap-3">
              <button
                onClick={() => setStep("profile")}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[13px] font-semibold border border-paper-deep text-ink hover:bg-paper-warm transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <button
                onClick={saveService}
                disabled={savingService || serviceAdded || !serviceName.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold bg-ink text-white hover:bg-ink/80 disabled:opacity-50 transition-colors"
              >
                {serviceAdded ? (
                  <><Check className="w-4 h-4" /> Added!</>
                ) : savingService ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                ) : (
                  <>Add Service <ArrowRight className="w-3.5 h-3.5" /></>
                )}
              </button>
              <button
                onClick={() => setStep("stripe")}
                className="px-4 py-2.5 rounded-lg text-[13px] font-semibold text-ink-quiet hover:text-ink transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {step === "stripe" && (
          <div className="bg-white rounded-2xl border border-paper-deep shadow-sm overflow-hidden">
            <div className="px-7 pt-7 pb-5 border-b border-paper-deep">
              <div className="flex items-center justify-between mb-1">
                <ProgressDots current={3} />
                <button onClick={() => setStep("done")} className="text-ink-quiet hover:text-ink transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <h2 className="text-[18px] font-bold text-ink mt-4">Get paid online</h2>
              <p className="text-[13px] text-ink-quiet mt-1">Connect Stripe so customers can pay invoices directly from their portal.</p>
            </div>

            <div className="px-7 py-6">
              <div className="bg-paper-warm rounded-xl p-5 space-y-3 mb-5">
                {[
                  "Customers pay invoices with a card in one click",
                  "Funds go directly to your bank account",
                  "Automatic paid status — no manual tracking",
                  "2% platform fee per transaction",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2.5">
                    <div className="w-4 h-4 rounded-full bg-[#f0fdf4] border border-[#86efac] flex items-center justify-center flex-shrink-0">
                      <Check className="w-2.5 h-2.5 text-[#16a34a]" />
                    </div>
                    <p className="text-[13px] text-ink">{item}</p>
                  </div>
                ))}
              </div>

              {connectError && (
                <p className="text-[12px] text-[#dc2626] mb-3">{connectError}</p>
              )}

              <button
                onClick={handleConnectStripe}
                disabled={connectLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[14px] font-semibold bg-[#635bff] text-white hover:bg-[#4f46e5] disabled:opacity-50 transition-colors mb-3"
              >
                {connectLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                {connectLoading ? "Redirecting to Stripe…" : "Connect with Stripe"}
              </button>

              <button
                onClick={() => setStep("done")}
                className="w-full px-4 py-2.5 rounded-xl text-[13px] font-semibold border border-paper-deep text-ink-quiet hover:text-ink hover:bg-paper-warm transition-colors"
              >
                I'll do this later
              </button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="bg-white rounded-2xl border border-paper-deep shadow-sm overflow-hidden">
            <div className="px-8 py-10 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#f0fdf4] border border-[#86efac] flex items-center justify-center mx-auto mb-5">
                <PartyPopper className="w-8 h-8 text-[#16a34a]" />
              </div>
              <h1 className="text-[22px] font-bold text-ink">You're all set!</h1>
              <p className="text-[14px] text-ink-quiet mt-2 max-w-sm mx-auto">
                Your account is ready. Head to the dashboard to add customers, create jobs, and start sending invoices.
              </p>

              <div className="mt-7 space-y-2.5 text-left max-w-xs mx-auto">
                {[
                  "Add your customers",
                  "Create and schedule jobs",
                  "Send estimates & invoices",
                  "Track revenue & expenses",
                ].map((tip) => (
                  <div key={tip} className="flex items-center gap-2.5">
                    <div className="w-4 h-4 rounded-full bg-moss/10 flex items-center justify-center flex-shrink-0">
                      <ArrowRight className="w-2.5 h-2.5 text-moss" />
                    </div>
                    <p className="text-[13px] text-ink">{tip}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={completeOnboarding}
                disabled={completing}
                className="mt-8 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[14px] font-semibold bg-ink text-white hover:bg-ink/80 disabled:opacity-50 transition-colors"
              >
                {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {completing ? "Loading…" : "Go to Dashboard"}
                {!completing && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
