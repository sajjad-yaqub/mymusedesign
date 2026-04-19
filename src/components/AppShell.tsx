import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";

const sections = [
  { to: "/generate", label: "Generate" },
  { to: "/profile", label: "Profile" },
  { to: "/interview", label: "Interview" },
  { to: "/history", label: "History" },
];

export default function AppShell() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
  }, [user, loading, navigate]);

  if (loading || !user) return null;

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-border flex flex-col">
        <div className="px-7 pt-8 pb-12">
          <div className="font-serif text-xl text-ink leading-none">My Muse</div>
          <div className="text-[11px] tracking-[0.18em] uppercase text-ink-faint mt-2">
            Personal design intelligence
          </div>
        </div>

        <nav className="px-4 flex-1">
          {sections.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              className={({ isActive }) =>
                `block px-3 py-2 text-[13px] border-l transition-colors ${
                  isActive
                    ? "border-ink text-ink"
                    : "border-transparent text-muted-foreground hover:text-ink"
                }`
              }
            >
              {s.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="text-[11px] text-ink-faint truncate mb-2">{user.email}</div>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              navigate("/auth", { replace: true });
            }}
            className="text-xs text-muted-foreground hover:text-ink transition"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
