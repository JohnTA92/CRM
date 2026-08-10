import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Leaf, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setSent(true);
  }

  return (
    <div className="min-h-screen bg-paper-warm flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl bg-moss flex items-center justify-center">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <span className="text-[20px] font-bold text-ink">FieldCRM</span>
        </div>

        <div className="bg-white rounded-2xl border border-paper-deep shadow-sm p-8">
          {sent ? (
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[#e8f5e9] flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-6 h-6 text-[#2e7d32]" />
              </div>
              <h1 className="text-[18px] font-semibold text-ink mb-2">Check your email</h1>
              <p className="text-[13px] text-ink-quiet">
                We sent a password reset link to <strong>{email}</strong>.
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-[20px] font-semibold text-ink mb-1">Reset password</h1>
              <p className="text-[13px] text-ink-quiet mb-6">
                Enter your email and we'll send you a reset link.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoFocus
                    className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#fef2f2] border border-[#fecaca] text-[13px] text-[#dc2626]">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="w-full py-2.5 rounded-lg text-[14px] font-semibold bg-moss text-white hover:bg-moss/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? "Sending…" : "Send Reset Link"}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-[13px] text-ink-quiet mt-5">
          <Link to="/login" className="text-accent font-medium hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
