import * as React from "react";
import {
  Archive,
  ChartColumnBig,
  Database,
  Megaphone,
  MonitorCog,
  MoonStar,
  Orbit,
  Settings,
  Sun,
} from "lucide-react";
import { Toast } from "./components";
import { GeneralPage } from "./pages/GeneralPage";
import { PreviewPage } from "./pages/PreviewPage";
import { SiteConfigPage } from "./pages/SiteConfigPage";
import { AnnouncementsPage } from "./pages/AnnouncementsPage";
import { DataPage } from "./pages/DataPage";
import { UninstallPage } from "./pages/UninstallPage";
import { OrphansPage } from "./pages/OrphansPage";
import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  { id: "general", label: "常规", icon: Settings },
  { id: "preview", label: "阅读增强", icon: MonitorCog },
  { id: "site-config", label: "站点配置", icon: ChartColumnBig },
  { id: "announcements", label: "公告", icon: Megaphone },
  { id: "data", label: "数据管理", icon: Database },
  { id: "uninstall", label: "卸载向导", icon: Archive },
  { id: "orphans", label: "悬空评论", icon: Orbit },
] as const;

type NavId = (typeof NAV_GROUPS)[number]["id"];

function useAdminTheme() {
  const [dark, setDark] = React.useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("maltose:admin-theme");
      if (stored === "dark") return true;
      if (stored === "light") return false;
    } catch {
      // ignore
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  React.useEffect(() => {
    // Toggle on the app root itself so the .dark token overrides apply to
    // the root background too (a child-scoped class left the root light).
    document
      .getElementById("maltose-admin-root")
      ?.classList.toggle("dark", dark);
    try {
      localStorage.setItem("maltose:admin-theme", dark ? "dark" : "light");
    } catch {
      // ignore
    }
  }, [dark]);

  return { dark, toggle: () => setDark((v) => !v) };
}

export function App() {
  const { dark, toggle } = useAdminTheme();
  const [active, setActive] = React.useState<NavId>("general");
  const [toast, setToast] = React.useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  // Session-expiry / fetch errors from the api layer surface here.
  React.useEffect(() => {
    const onApiError = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string }>).detail;
      setToast({ kind: "error", message: detail?.message || "请求失败" });
    };
    window.addEventListener("maltose:admin-api-error", onApiError);
    return () =>
      window.removeEventListener("maltose:admin-api-error", onApiError);
  }, []);

  return (
    <div className="maltose-admin flex min-h-full">
      <aside className="w-52 shrink-0">
        <div className="sticky top-6">
          <div className="mb-4 flex items-center gap-2 px-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-mint-600 text-sm font-bold text-primary-foreground shadow-[0_0_10px] shadow-primary/30">
              M
            </span>
            <div>
              <div className="text-sm font-bold text-foreground">Maltose</div>
              <div className="text-[11px] text-muted-foreground">主题后台</div>
            </div>
          </div>
          <nav className="flex flex-col gap-0.5">
            {NAV_GROUPS.map((group) => {
              const Icon = group.icon;
              const isActive = active === group.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setActive(group.id)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {group.label}
                </button>
              );
            })}
          </nav>
          <button
            type="button"
            onClick={toggle}
            className="mt-4 flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {dark ? (
              <Sun className="size-4" />
            ) : (
              <MoonStar className="size-4" />
            )}
            {dark ? "浅色" : "深色"}
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 pl-8">
        {active === "general" && <GeneralPage />}
        {active === "preview" && <PreviewPage />}
        {active === "site-config" && <SiteConfigPage />}
        {active === "announcements" && <AnnouncementsPage />}
        {active === "data" && <DataPage />}
        {active === "uninstall" && <UninstallPage />}
        {active === "orphans" && <OrphansPage />}
      </main>
      {toast && (
        <Toast
          kind={toast.kind}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
