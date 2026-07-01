import { useTheme } from "@/lib/theme";
import { Sun, Moon, Monitor } from "lucide-react";
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

export function SettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-ink">Settings</h1>
        <p className="text-[14px] text-ink-quiet mt-1">Manage your app preferences.</p>
      </div>

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
