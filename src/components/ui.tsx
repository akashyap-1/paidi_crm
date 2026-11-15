import { X } from "lucide-react";
import {
  createContext, useCallback, useContext, useEffect, useId, useRef, useState,
  type ReactNode,
} from "react";
import { MAX_TOUCHES, STAGE_LABEL, stageClass } from "../lib/constants";
import type { Member, Stage } from "../lib/types";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// --- Sheet: a side panel on desktop, a bottom sheet on phones ---------------

export function Sheet({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const first = panel.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-close])");
    first?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-stretch">
      <div className="absolute inset-0 bg-navy/35" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={cx(
          "relative flex max-h-[92dvh] w-full flex-col bg-buff shadow-lift sm:max-h-none",
          "rounded-t-[20px] sm:rounded-none sm:rounded-l-[20px]",
          wide ? "sm:w-[640px]" : "sm:w-[480px]",
          "animate-[sheet-in_260ms_var(--ease-out)]",
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id={titleId} className="section-title text-[18px]">{title}</h2>
          <button data-close className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        )}
      </div>
      <style>{`@keyframes sheet-in{from{opacity:.4;transform:translateY(16px)}to{opacity:1;transform:none}}
@media(min-width:640px){@keyframes sheet-in{from{opacity:.4;transform:translateX(24px)}to{opacity:1;transform:none}}}`}</style>
    </div>
  );
}

// --- Form bits ---------------------------------------------------------------

export function Field({ label, hint, error, children, className }: {
  label: string; hint?: string; error?: string | null; children: ReactNode; className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="label">{label}</span>
      {children}
      {error ? <p className="hint !text-magenta-dark" role="alert">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </label>
  );
}

export function Tabs<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-[12px] bg-lane p-1">
      {options.map((o) => (
        <button
          key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cx(
            "h-8 rounded-[9px] px-3.5 text-[13.5px] font-semibold transition-colors duration-150",
            value === o.value ? "bg-navy text-buff shadow-soft" : "text-navy hover:bg-sand",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// --- Domain marks ------------------------------------------------------------

/** Fit drawn as dot size on a fixed five-step ramp. */
export function FitDot({ score, showNumber }: { score: number | null; showNumber?: boolean }) {
  const s = score ?? 0;
  const size = s ? 4 + s * 2 : 6;
  return (
    <span className="inline-flex items-center gap-1.5" title={s ? `Fit ${s} of 5` : "No fit score"}>
      <span className="grid h-[14px] w-[14px] place-items-center">
        <span
          className={cx("block rounded-full", s ? "bg-depth-8" : "border border-dashed border-mute")}
          style={{ width: size, height: size }}
        />
      </span>
      {showNumber && <span className="text-[13px] font-semibold">{s || "–"}</span>}
      <span className="sr-only">{s ? `Fit ${s} of 5` : "No fit score"}</span>
    </span>
  );
}

/** The 3-touch cadence as three fixed slots. */
export function TouchSlots({ used, replied }: { used: number; replied?: boolean }) {
  const label = replied ? `Replied after ${used} touch${used === 1 ? "" : "es"}` : `${Math.min(used, MAX_TOUCHES)} of ${MAX_TOUCHES} touches used`;
  return (
    <span className="inline-flex items-center gap-[3px]" title={label}>
      {Array.from({ length: MAX_TOUCHES }, (_, i) => (
        <span
          key={i}
          className={cx(
            "block h-[9px] w-[9px] rounded-[3px] border",
            i < used ? (replied ? "border-green bg-green" : "border-navy bg-navy") : "border-[#9aa7b0] bg-transparent",
          )}
        />
      ))}
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function StageChip({ stage }: { stage: Stage }) {
  return <span className={cx("chip", stageClass(stage))}>{STAGE_LABEL[stage]}</span>;
}

export function Avatar({ member, size = 22 }: { member?: Member | null; size?: number }) {
  const name = member?.display_name ?? "Unassigned";
  return (
    <span
      title={name} aria-label={name}
      className={cx("inline-grid shrink-0 place-items-center rounded-full font-bold",
        member ? "bg-depth-2 text-navy" : "border border-dashed border-mute text-mute")}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.48) }}
    >
      {member ? name[0] : "?"}
    </span>
  );
}

// --- States ------------------------------------------------------------------

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[14px] border border-dashed border-[#cbbf9b] px-6 py-10 text-center">
      <p className="section-title">{title}</p>
      {children && <p className="mx-auto mt-1.5 max-w-[46ch] text-mute">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-mute" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-depth-3 border-t-depth-8" />
      {label}
    </div>
  );
}

export function ErrorNote({ error }: { error: Error | string }) {
  return (
    <div className="rounded-[12px] border border-magenta/30 bg-magenta-tint px-4 py-3 text-magenta-dark" role="alert">
      <strong>Something went wrong.</strong> {typeof error === "string" ? error : error.message}
    </div>
  );
}

// --- Toasts ------------------------------------------------------------------

interface Toast { id: number; message: string; tone: "ok" | "error"; action?: { label: string; run: () => void } }
const ToastContext = createContext<(message: string, opts?: Partial<Omit<Toast, "id" | "message">>) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, opts?: Partial<Omit<Toast, "id" | "message">>) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone: opts?.tone ?? "ok", action: opts?.action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts?.action ? 8000 : 4500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto flex items-center gap-3 rounded-[12px] px-4 py-2.5 text-[13.5px] font-medium shadow-lift",
              t.tone === "error" ? "bg-magenta-dark text-white" : "bg-navy text-buff",
            )}
          >
            {t.message}
            {t.action && (
              <button
                className="rounded-md px-1.5 font-bold underline underline-offset-2"
                onClick={() => { t.action!.run(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Runs an async action with a busy flag and an error toast. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<unknown>, success?: string): Promise<boolean> => {
    setBusy(true);
    try {
      await fn();
      if (success) toast(success);
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : "That did not work. Try again.", { tone: "error" });
      return false;
    } finally {
      setBusy(false);
    }
  }, [toast]);
  return { busy, run };
}
