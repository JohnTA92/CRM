export type ServiceType = "lawn" | "pressure-washing" | "window-cleaning" | "custom";

export type JobStatus =
  | "draft"
  | "quoted"
  | "scheduled"
  | "in-progress"
  | "complete"
  | "invoiced";

export type EstimateStatus = "draft" | "sent" | "approved" | "declined" | "expired";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "voided";

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  serviceTypes: ServiceType[];
  notes: string;
  createdAt: string;
  archived: boolean;
}

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  type: "labor" | "material" | "service";
}

export interface Estimate {
  id: string;
  jobId: string;
  customerId: string;
  status: EstimateStatus;
  lineItems: LineItem[];
  notes: string;
  createdAt: string;
  sentAt: string | null;
  expiresAt: string | null;
  total: number;
}

export interface Invoice {
  id: string;
  jobId: string;
  customerId: string;
  estimateId: string | null;
  status: InvoiceStatus;
  lineItems: LineItem[];
  notes: string;
  createdAt: string;
  sentAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  total: number;
}

export interface Job {
  id: string;
  customerId: string;
  serviceType: ServiceType;
  title: string;
  status: JobStatus;
  scheduledDate: string | null;
  scheduledTime: string | null;
  durationMinutes: number;
  assignedTo: string | null;
  notes: string;
  estimateId: string | null;
  invoiceId: string | null;
  recurring: "none" | "weekly" | "biweekly" | "monthly";
  createdAt: string;
}

export interface CrewMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "owner" | "dispatcher" | "crew";
  avatar: string;
}

export const crewMembers: CrewMember[] = [];

export const customers: Customer[] = [];

export const jobs: Job[] = [];

export const estimates: Estimate[] = [];

export const invoices: Invoice[] = [];

export function getCustomer(id: string) {
  return customers.find((c) => c.id === id);
}

export function getJobsForCustomer(customerId: string) {
  return jobs.filter((j) => j.customerId === customerId);
}

export function getInvoicesForCustomer(customerId: string) {
  return invoices.filter((i) => i.customerId === customerId);
}

export function getEstimatesForCustomer(customerId: string) {
  return estimates.filter((e) => e.customerId === customerId);
}

export function getCrewMember(id: string) {
  return crewMembers.find((c) => c.id === id);
}

export function jobStatusLabel(status: JobStatus): string {
  const labels: Record<JobStatus, string> = {
    draft: "Draft",
    quoted: "Quoted",
    scheduled: "Scheduled",
    "in-progress": "In Progress",
    complete: "Complete",
    invoiced: "Invoiced",
  };
  return labels[status];
}

export function estimateStatusLabel(status: EstimateStatus): string {
  const labels: Record<EstimateStatus, string> = {
    draft: "Draft",
    sent: "Sent",
    approved: "Approved",
    declined: "Declined",
    expired: "Expired",
  };
  return labels[status];
}

export function invoiceStatusLabel(status: InvoiceStatus): string {
  const labels: Record<InvoiceStatus, string> = {
    draft: "Draft",
    sent: "Sent",
    paid: "Paid",
    overdue: "Overdue",
    voided: "Voided",
  };
  return labels[status];
}

export function serviceTypeLabel(type: ServiceType): string {
  const labels: Record<ServiceType, string> = {
    lawn: "Lawn Care",
    "pressure-washing": "Pressure Washing",
    "window-cleaning": "Window Cleaning",
    custom: "Custom",
  };
  return labels[type];
}
