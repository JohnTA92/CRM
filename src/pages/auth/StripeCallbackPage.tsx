import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Loader2, CheckCircle2, AlertCircle, Leaf } from "lucide-react";

export function StripeCallbackPage() {
  const [searchParams] = useSearchParams();
  const { business } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "incomplete" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!business?.id) return;
    verify(business.id);
  }, [business?.id]);

  async function verify(businessId: string) {
    const { data, error } = await supabase.functions.invoke("stripe-connect-callback", {
      body: { business_id: businessId },
    });

    if (error || data?.error) {
      setStatus("error");
      setMessage(data?.error ?? error?.message ?? "Something went wrong.");
      return;
    }

    if (data.charges_enabled) {
      setStatus("success");
      setMessage("Your Stripe account is connected and ready to accept payments.");
      setTimeout(() => navigate("/settings", { replace: true }), 3000);
    } else {
      setStatus("incomplete");
      setMessage("Your Stripe account was created but isn't fully verified yet. You may need to provide additional information in Stripe.");
      setTimeout(() => navigate("/settings", { replace: true }), 4000);
    }
  }

  return (
    <div className="min-h-screen bg-paper-warm flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl bg-moss flex items-center justify-center">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <span className="text-[20px] font-bold text-ink">FieldCRM</span>
        </div>

        <div className="bg-white rounded-2xl border border-paper-deep shadow-sm p-8">
          {status === "loading" && (
            <>
              <Loader2 className="w-10 h-10 animate-spin text-ink-quiet mx-auto mb-4" />
              <p className="text-[15px] font-semibold text-ink">Verifying your Stripe account…</p>
              <p className="text-[13px] text-ink-quiet mt-2">Just a moment.</p>
            </>
          )}
          {status === "success" && (
            <>
              <div className="w-14 h-14 rounded-full bg-[#e8f5e9] flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-[#2e7d32]" />
              </div>
              <p className="text-[15px] font-semibold text-ink">Stripe connected!</p>
              <p className="text-[13px] text-ink-quiet mt-2">{message}</p>
              <p className="text-[12px] text-ink-quiet mt-3">Redirecting to Settings…</p>
            </>
          )}
          {status === "incomplete" && (
            <>
              <div className="w-14 h-14 rounded-full bg-[#fff8e1] flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-7 h-7 text-[#f57f17]" />
              </div>
              <p className="text-[15px] font-semibold text-ink">Almost there</p>
              <p className="text-[13px] text-ink-quiet mt-2">{message}</p>
              <p className="text-[12px] text-ink-quiet mt-3">Redirecting to Settings…</p>
            </>
          )}
          {status === "error" && (
            <>
              <div className="w-14 h-14 rounded-full bg-[#fef2f2] flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-7 h-7 text-[#dc2626]" />
              </div>
              <p className="text-[15px] font-semibold text-ink">Something went wrong</p>
              <p className="text-[13px] text-ink-quiet mt-2">{message}</p>
              <button
                onClick={() => navigate("/settings")}
                className="mt-4 px-4 py-2 rounded-lg text-[13px] font-semibold bg-ink text-white hover:bg-ink/80 transition-colors"
              >
                Back to Settings
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
