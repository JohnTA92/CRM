import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Leaf, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

export function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!businessName.trim() || !email.trim() || password.length < 6) return;
    setLoading(true);
    setError(null);
    const err = await signUp(email.trim(), password, businessName);
    setLoading(false);
    if (err) { setError(err); return; }
    // Supabase may require email confirmation depending on project settings
    setNeedsConfirmation(true);
    setTimeout(() => navigate("/", { replace: true }), 2000);
  }

  if (needsConfirmation) {
    return (
      <div className="min-h-screen bg-paper-warm flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-12 h-12 rounded-full bg-[#e8f5e9] flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-6 h-6 text-[#2e7d32]" />
          </div>
          <h1 className="text-[20px] font-semibold text-ink mb-2">Account created!</h1>
          <p className="text-[13px] text-ink-quiet">
            Check your email to confirm your account, then you'll be redirected automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper-warm flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl bg-moss flex items-center justify-center">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <span className="text-[20px] font-bold text-ink">FieldCRM</span>
        </div>

        <div className="bg-white rounded-2xl border border-paper-deep shadow-sm p-8">
          <h1 className="text-[20px] font-semibold text-ink mb-1">Create your account</h1>
          <p className="text-[13px] text-ink-quiet mb-6">Start managing your field service business</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">
                Business Name <span className="text-accent">*</span>
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Green Thumb Lawn Care"
                required
                autoFocus
                className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors"
              />
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">
                Email <span className="text-accent">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors"
              />
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">
                Password <span className="text-accent">*</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                required
                minLength={6}
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
              disabled={loading || !businessName.trim() || !email.trim() || password.length < 6}
              className="w-full py-2.5 rounded-lg text-[14px] font-semibold bg-moss text-white hover:bg-moss/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </form>

          <p className="text-[11px] text-ink-quiet text-center mt-5">
            By signing up you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>

        <p className="text-center text-[13px] text-ink-quiet mt-5">
          Already have an account?{" "}
          <Link to="/login" className="text-accent font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
