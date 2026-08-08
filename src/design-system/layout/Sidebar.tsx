import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  CalendarDays,
  FileText,
  Receipt,
  Settings,
  Leaf,
  Wallet,
  Wrench,
  Camera,
  Navigation,
  HardHat,
  TrendingUp,
} from "lucide-react";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/customers", icon: Users, label: "Customers" },
  { to: "/jobs", icon: Briefcase, label: "Jobs" },
  { to: "/schedule", icon: CalendarDays, label: "Schedule" },
  { to: "/estimates", icon: FileText, label: "Estimates" },
  { to: "/invoices", icon: Receipt, label: "Invoices" },
  { to: "/expenses", icon: Wallet, label: "Expenses" },
  { to: "/services", icon: Wrench, label: "Services" },
  { to: "/media", icon: Camera, label: "Job Media" },
  { to: "/routes", icon: Navigation, label: "Routes" },
  { to: "/crew", icon: HardHat, label: "Crew" },
  { to: "/revenue", icon: TrendingUp, label: "Revenue" },
];

export function Sidebar() {
  const { theme } = useTheme();
  const dark = theme === "dark";

  const bg = dark ? "bg-[#111111] border-r border-white/10" : "bg-white border-r border-paper-deep";
  const logoText = dark ? "text-white" : "text-ink";
  const logoSub = dark ? "text-white/40" : "text-ink-quiet";
  const divider = dark ? "border-white/10" : "border-paper-deep";
  const navActive = dark ? "bg-white/10 text-white" : "bg-accent/10 text-accent";
  const navInactive = dark ? "text-white/50 hover:text-white hover:bg-white/5" : "text-ink-soft hover:text-ink hover:bg-paper-warm";
  const ownerText = dark ? "text-white" : "text-ink";
  const ownerSub = dark ? "text-white/40" : "text-ink-quiet";

  return (
    <aside className={cn("fixed top-0 left-0 h-screen w-56 flex flex-col z-40", bg)}>
      <div className={cn("flex items-center gap-2.5 px-5 py-5 border-b", divider)}>
        <div className="w-7 h-7 rounded-lg bg-moss flex items-center justify-center flex-shrink-0">
          <Leaf className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className={cn("font-semibold text-[14px] leading-tight", logoText)}>My Business</p>
          <p className={cn("text-[11px]", logoSub)}>Field CRM</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors duration-150",
                isActive ? navActive : navInactive,
              )
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className={cn("px-3 py-4 border-t", divider)}>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors duration-150",
              isActive ? navActive : navInactive,
            )
          }
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          Settings
        </NavLink>
        <div className="flex items-center gap-2.5 px-3 py-2.5 mt-1">
          <div className="w-6 h-6 rounded-full bg-moss flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
            ME
          </div>
          <div className="min-w-0">
            <p className={cn("text-[12px] font-medium truncate", ownerText)}>Owner</p>
            <p className={cn("text-[10px] truncate", ownerSub)}>Admin</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
