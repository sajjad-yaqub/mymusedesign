import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { Sparkles, User, Compass, Clock, LogOut, ChevronLeft, ChevronRight } from "lucide-react";

const sections = [
  { to: "/generate", label: "Generate", icon: Sparkles },
  { to: "/taste", label: "Your Taste", icon: Compass },
  { to: "/profile", label: "Profile", icon: User },
  { to: "/history", label: "History", icon: Clock },
];

export default function AppShell() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
  }, [user, loading, navigate]);

  if (loading || !user) return null;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background text-foreground">
      {/* Sidebar — desktop */}
      <aside
        className={`hidden md:flex shrink-0 border-r border-border flex-col h-screen sticky top-0 transition-[width] duration-200 ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        <div className={`pt-8 pb-8 ${collapsed ? "px-3" : "px-7"} flex items-start justify-between gap-2`}>
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-serif text-xl text-ink leading-none truncate">My Muse Design</div>
              <div className="text-[11px] tracking-[0.18em] uppercase text-ink-faint mt-2">
                Taste Matters
              </div>
            </div>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="text-muted-foreground hover:text-ink transition shrink-0"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className={`flex-1 overflow-y-auto ${collapsed ? "px-2" : "px-4"}`}>
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <NavLink
                key={s.to}
                to={s.to}
                title={collapsed ? s.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 text-[13px] border-l transition-colors ${
                    isActive
                      ? "border-ink text-ink"
                      : "border-transparent text-muted-foreground hover:text-ink"
                  } ${collapsed ? "justify-center" : ""}`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate">{s.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className={`border-t border-border shrink-0 ${collapsed ? "p-2" : "p-4"}`}>
          {!collapsed && (
            <div className="text-[11px] text-ink-faint truncate mb-2">{user.email}</div>
          )}
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              navigate("/auth", { replace: true });
            }}
            title={collapsed ? "Sign out" : undefined}
            className={`flex items-center gap-2 text-xs text-muted-foreground hover:text-ink transition ${
              collapsed ? "justify-center w-full" : ""
            }`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Top bar — mobile (sticky) */}
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between px-5 h-14 border-b border-border bg-background/95 backdrop-blur">
        <div className="font-serif text-lg text-ink">My Muse Design</div>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            navigate("/auth", { replace: true });
          }}
          aria-label="Sign out"
          className="text-muted-foreground hover:text-ink"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      <main className="flex-1 min-w-0 overflow-y-auto pb-20 md:pb-0">
        <Outlet />
      </main>

      {/* Bottom nav — mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur z-40">
        <div className="grid grid-cols-4">
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <NavLink
                key={s.to}
                to={s.to}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-1 py-2.5 min-h-[56px] text-[10px] tracking-wide transition ${
                    isActive ? "text-ink" : "text-muted-foreground"
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                {s.label}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
