import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "@/lib/theme";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Sidebar } from "@/design-system/layout/Sidebar";
import { DashboardPage } from "@/pages/crm/DashboardPage";
import { CustomersPage } from "@/pages/crm/CustomersPage";
import { CustomerDetailPage } from "@/pages/crm/CustomerDetailPage";
import { JobsPage } from "@/pages/crm/JobsPage";
import { JobDetailPage } from "@/pages/crm/JobDetailPage";
import { SchedulePage } from "@/pages/crm/SchedulePage";
import { EstimatesPage } from "@/pages/crm/EstimatesPage";
import { EstimateDetailPage } from "@/pages/crm/EstimateDetailPage";
import { InvoicesPage } from "@/pages/crm/InvoicesPage";
import { InvoiceDetailPage } from "@/pages/crm/InvoiceDetailPage";
import { SettingsPage } from "@/pages/crm/SettingsPage";
import { ExpensesPage } from "@/pages/crm/ExpensesPage";
import { ServicesPage } from "@/pages/crm/ServicesPage";
import { MediaPage } from "@/pages/crm/MediaPage";
import { RoutePage } from "@/pages/crm/RoutePage";
import { CrewPage } from "@/pages/crm/CrewPage";
import { RevenuePage } from "@/pages/crm/RevenuePage";
import { SchedulingPage } from "@/pages/crm/SchedulingPage";
import { CustomerPortalPage } from "@/pages/portal/CustomerPortalPage";
import { CrewPortalPage } from "@/pages/portal/CrewPortalPage";
import { LoginPage } from "@/pages/auth/LoginPage";
import { SignupPage } from "@/pages/auth/SignupPage";
import { ForgotPasswordPage } from "@/pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/auth/ResetPasswordPage";
import { StripeCallbackPage } from "@/pages/auth/StripeCallbackPage";
import { SubscriptionGate } from "@/components/SubscriptionGate";
import { OnboardingWizard } from "@/pages/onboarding/OnboardingWizard";
import { AdminPage } from "@/pages/admin/AdminPage";
import { Loader2 } from "lucide-react";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (DEV_MODE && localStorage.getItem("dev_bypass") === "true") return <>{children}</>;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper-warm">
        <Loader2 className="w-6 h-6 animate-spin text-ink-quiet" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="flex items-center justify-center h-64 text-ink-quiet text-[14px]">
      Page not found.
    </div>
  );
}

function AppLayout() {
  return (
    <div className="flex min-h-screen bg-paper-warm">
      <Sidebar />
      <main className="ml-56 flex-1 min-w-0">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/:id" element={<CustomerDetailPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/estimates" element={<EstimatesPage />} />
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/media" element={<MediaPage />} />
          <Route path="/routes" element={<RoutePage />} />
          <Route path="/crew" element={<CrewPage />} />
          <Route path="/scheduling" element={<SchedulingPage />} />
          <Route path="/revenue" element={<RevenuePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

const DEV_MODE = import.meta.env.VITE_DEV_MODE === "true";

function OnboardingOrApp() {
  const { business } = useAuth();
  if (!DEV_MODE && !business?.onboarding_complete) return <OnboardingWizard />;
  return (
    <SubscriptionGate>
      <AppLayout />
    </SubscriptionGate>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Admin panel — separate from the main app, no subscription gate */}
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/*" element={<AdminPage />} />

            {/* Public portal routes — no auth required */}
            <Route path="/portal/:customerId" element={<CustomerPortalPage />} />
            <Route path="/crew-portal/:crewId" element={<CrewPortalPage />} />

            {/* Auth routes — redirect to dashboard if already signed in */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Stripe Connect return — needs auth context but not the full app shell */}
            <Route path="/stripe/callback" element={
              <RequireAuth>
                <StripeCallbackPage />
              </RequireAuth>
            } />

            {/* Protected CRM routes — onboarding first, then subscription gate, then app */}
            <Route path="/*" element={
              <RequireAuth>
                <OnboardingOrApp />
              </RequireAuth>
            } />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
