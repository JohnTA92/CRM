import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/lib/theme";
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

function NotFound() {
  return (
    <div className="flex items-center justify-center h-64 text-ink-quiet text-[14px]">
      Page not found.
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
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
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
    </ThemeProvider>
  );
}
