import {
  ChartNoAxesColumn, CheckSquare, FileText, Home, Inbox, KanbanSquare, LogOut, Menu, Phone, Plus,
  Settings, Upload, Users,
} from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { DEMO } from "../lib/db";
import { useTable } from "../lib/data";
import { ProspectSheet, TouchSheet } from "./forms";
import { Avatar, cx, Sheet } from "./ui";

interface QuickActions {
  addProspect: () => void;
  logTouch: (companyId?: string | null) => void;
}
const QuickContext = createContext<QuickActions>({ addProspect: () => {}, logTouch: () => {} });
export const useQuick = () => useContext(QuickContext);

const NAV = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { to: "/contacts", label: "Contacts", icon: Users },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/templates", label: "Templates", icon: FileText },
  { to: "/review", label: "Review queue", icon: Inbox },
  { to: "/dashboards", label: "Dashboards", icon: ChartNoAxesColumn, gap: true },
  { to: "/import", label: "Import", icon: Upload },
  { to: "/settings", label: "Settings", icon: Settings },
];
const MOBILE_PRIMARY = ["/", "/pipeline", "/tasks", "/review"];

export function Shell() {
  const { member, signOut } = useAuth();
  const navigate = useNavigate();
  const threads = useTable("gmail_threads");
  const reviewCount = threads.rows.filter((t) => t.status === "review").length;
  const [prospectOpen, setProspectOpen] = useState(false);
  const [touch, setTouch] = useState<{ open: boolean; companyId: string | null }>({ open: false, companyId: null });
  const [moreOpen, setMoreOpen] = useState(false);

  const addProspect = useCallback(() => setProspectOpen(true), []);
  const logTouch = useCallback((companyId?: string | null) => setTouch({ open: true, companyId: companyId ?? null }), []);
  const quick = useMemo(() => ({ addProspect, logTouch }), [addProspect, logTouch]);

  const badge = (to: string) => to === "/review" && reviewCount > 0 ? (
    <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-magenta px-1.5 text-[11px] font-bold text-white">
      {reviewCount}<span className="sr-only"> threads to review</span>
    </span>
  ) : null;

  return (
    <QuickContext.Provider value={quick}>
      <div className="flex min-h-dvh">
        {/* Desktop rail */}
        <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col bg-navy px-3 pb-4 pt-6 text-rail-text lg:flex">
          <p className="px-3 pb-6 text-[20px] font-bold tracking-[0.04em] text-buff">PAIDI CRM</p>
          <nav aria-label="Main" className="flex flex-col gap-0.5">
            {NAV.map(({ to, label, icon: Icon, end, gap }) => (
              <NavLink
                key={to} to={to} end={end}
                className={({ isActive }) => cx(
                  "flex h-9 items-center gap-2.5 rounded-[10px] px-3 text-[14px] font-medium transition-colors duration-150",
                  gap && "mt-4",
                  isActive ? "bg-buff font-bold text-navy" : "hover:bg-navy-soft hover:text-buff",
                )}
              >
                <Icon size={17} strokeWidth={2} aria-hidden="true" />
                {label}
                {badge(to)}
              </NavLink>
            ))}
          </nav>
          <button className="btn mt-5 border-navy-soft bg-navy-soft text-buff hover:border-depth-7 hover:bg-depth-7" onClick={() => logTouch()}>
            <Phone size={15} aria-hidden="true" /> Log a touch
          </button>
          <div className="mt-auto flex items-center gap-3 border-t border-navy-soft px-2 pt-4">
            <Avatar member={member} size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold text-buff">{member?.display_name}</p>
              <p className="truncate text-[12px]">{DEMO ? "Demo data" : member?.role === "admin" ? "Admin" : "Editor"}</p>
            </div>
            <button className="btn btn-ghost btn-icon btn-sm text-rail-text hover:bg-navy-soft hover:text-buff" onClick={signOut} aria-label="Sign out" title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-navy px-4 text-buff lg:hidden">
            <p className="flex items-center gap-2 text-[17px] font-bold tracking-[0.04em]">
              PAIDI CRM
              {DEMO && <span className="chip chip-warn !h-5 tracking-normal">Demo data</span>}
            </p>
            <button className="btn btn-primary btn-sm" onClick={addProspect}><Plus size={15} aria-hidden="true" /> Prospect</button>
          </header>

          <main className="mx-auto w-full max-w-[1480px] flex-1 px-4 pb-28 pt-5 lg:px-7 lg:pb-10 lg:pt-6">
            <Outlet />
          </main>

          {/* Mobile bottom bar: the four daily screens, a log button, and More */}
          <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
            {NAV.filter((n) => MOBILE_PRIMARY.includes(n.to)).slice(0, 2).map((n) => <MobileLink key={n.to} {...n} />)}
            <button className="flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-bold text-magenta-dark" onClick={() => logTouch()}>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-magenta text-white"><Phone size={16} aria-hidden="true" /></span>
              Log
            </button>
            {NAV.filter((n) => MOBILE_PRIMARY.includes(n.to)).slice(2).map((n) => (
              <MobileLink key={n.to} {...n} label={n.to === "/review" ? "Review" : n.label} count={n.to === "/review" ? reviewCount : 0} />
            ))}
            <button className="flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold text-mute" onClick={() => setMoreOpen(true)}>
              <Menu size={19} aria-hidden="true" /> More
            </button>
          </nav>
        </div>
      </div>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="flex flex-col gap-1">
          {NAV.filter((n) => !MOBILE_PRIMARY.includes(n.to)).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={() => setMoreOpen(false)}
              className="flex h-12 items-center gap-3 rounded-[12px] px-3 text-[15px] font-semibold hover:bg-sand">
              <Icon size={18} aria-hidden="true" /> {label}
            </NavLink>
          ))}
          <button className="flex h-12 items-center gap-3 rounded-[12px] px-3 text-left text-[15px] font-semibold hover:bg-sand" onClick={signOut}>
            <LogOut size={18} aria-hidden="true" /> Sign out ({member?.display_name})
          </button>
        </div>
      </Sheet>
      <ProspectSheet open={prospectOpen} onClose={() => setProspectOpen(false)} onCreated={(id) => navigate(`/company/${id}`)} />
      <TouchSheet open={touch.open} companyId={touch.companyId} onClose={() => setTouch((t) => ({ ...t, open: false }))} />
    </QuickContext.Provider>
  );
}

function MobileLink({ to, label, icon: Icon, end, count }: {
  to: string; label: string; icon: typeof Home; end?: boolean; count?: number;
}) {
  return (
    <NavLink to={to} end={end}
      className={({ isActive }) => cx("relative flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold",
        isActive ? "text-navy" : "text-mute")}>
      {({ isActive }) => (
        <>
          <Icon size={19} strokeWidth={isActive ? 2.4 : 2} aria-hidden="true" />
          {label}
          {!!count && <span className="absolute right-[22%] top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-magenta px-1 text-[10px] font-bold text-white">{count}</span>}
        </>
      )}
    </NavLink>
  );
}

/** Shared page header: title, optional controls, and the primary action. */
export function PageHeader({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
      <h1 className="page-title mr-2">{title}</h1>
      {children}
      {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
    </header>
  );
}
