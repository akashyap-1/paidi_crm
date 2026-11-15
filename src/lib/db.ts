// One thin data-access layer. Everything goes through Supabase, where row level
// security decides what a signed-in user may do. On the dev server, demo mode
// swaps in an in-memory store so the UI can be explored without logging in.
import { createClient } from "@supabase/supabase-js";
import type { Stage, TableName, Tables } from "./types";
import { sizeBucket, suggestFitScore } from "./analytics";

export const DEMO = import.meta.env.DEV && import.meta.env.VITE_DEMO === "1";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } },
);

type Match = Record<string, string>;

export interface Db {
  list<T extends TableName>(table: T): Promise<Tables[T][]>;
  insert<T extends TableName>(table: T, rows: Partial<Tables[T]>[]): Promise<Tables[T][]>;
  update<T extends TableName>(table: T, match: Match, patch: Partial<Tables[T]>): Promise<void>;
  upsert<T extends TableName>(table: T, row: Partial<Tables[T]>, onConflict: string): Promise<void>;
  remove(table: TableName, match: Match): Promise<void>;
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  /** Calls a Supabase Edge Function as the signed-in user. */
  invoke<R = unknown>(fn: string, body: Record<string, unknown>): Promise<R>;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

const ORDER: Partial<Record<TableName, string>> = {
  companies: "created_at", contacts: "created_at", interactions: "occurred_at", tasks: "created_at",
  stage_changes: "created_at", templates: "created_at", research: "created_at",
  gmail_threads: "last_message_at", allowed_users: "created_at",
};

const live: Db = {
  async list(table) {
    let q = supabase.from(table).select("*");
    const order = ORDER[table];
    if (order) q = q.order(order, { ascending: table === "allowed_users" });
    const { data, error } = await q.limit(5000);
    fail(error);
    return (data ?? []) as never;
  },
  async insert(table, rows) {
    const { data, error } = await supabase.from(table).insert(rows as never).select();
    fail(error);
    return (data ?? []) as never;
  },
  async update(table, match, patch) {
    const { error } = await supabase.from(table).update(patch as never).match(match);
    fail(error);
  },
  async upsert(table, row, onConflict) {
    const { error } = await supabase.from(table).upsert(row as never, { onConflict });
    fail(error);
  },
  async remove(table, match) {
    const { error } = await supabase.from(table).delete().match(match);
    fail(error);
  },
  async rpc(name, args) {
    const { data, error } = await supabase.rpc(name, args);
    fail(error);
    return data;
  },
  async invoke(fn, body) {
    const { data, error } = await supabase.functions.invoke(fn, { body });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      const detail = ctx ? await ctx.json().catch(() => null) : null;
      throw new Error(detail?.error ?? error.message);
    }
    return data as never;
  },
};

// ---------------------------------------------------------------------------
// Demo store (dev server only; tree-shaken out of production builds)
// ---------------------------------------------------------------------------

async function demoDb(): Promise<Db> {
  const { buildDemoStore } = await import("../demo/data");
  const store = buildDemoStore() as unknown as Record<string, Record<string, unknown>[]>;
  const now = () => new Date().toISOString();
  const matches = (row: Record<string, unknown>, match: Match) =>
    Object.entries(match).every(([k, v]) => row[k] === v);
  const derive = (table: string, row: Record<string, unknown>) => {
    if (table === "companies") {
      const emp = (row.employee_count as number | null) ?? null;
      row.size_bucket = sizeBucket(emp);
      row.fit_score_suggested = suggestFitScore((row.industry as string) ?? null, emp);
      row.fit_score ??= row.fit_score_suggested;
    }
    if (table === "contacts") {
      row.is_technical = /(\bcto\b|\bcio\b|engineer|developer|technical|technology|software|\bit\b)/i.test(String(row.title ?? ""));
    }
  };
  const logStage = (companyId: string, from: Stage | null, to: Stage, reason: string | null) =>
    store.stage_changes.push({
      id: crypto.randomUUID(), company_id: companyId, from_stage: from, to_stage: to, automatic: false,
      reason, changed_by: "m-advik", undone_at: null, created_at: now(),
    });
  return {
    async list(table) { return [...store[table]] as never; },
    async insert(table, rows) {
      const out = rows.map((r) => {
        const row: Record<string, unknown> = {
          id: crypto.randomUUID(), created_at: now(), is_sample: false, do_not_contact: false,
          ...(table === "companies" ? { stage: "researched", owner_id: "m-advik", stage_changed_at: now(), last_contacted_at: null } : {}),
          ...(table === "tasks" ? { status: "todo", priority: "medium", source: "manual" } : {}),
          ...(table === "interactions" ? { team_member_id: "m-advik", occurred_at: now(), source: "manual" } : {}),
          ...r,
        };
        derive(table, row);
        store[table].push(row);
        if (table === "companies") logStage(row.id as string, null, row.stage as Stage, "Created");
        if (table === "interactions") {
          const co = store.companies.find((c) => c.id === row.company_id);
          if (co && (!co.last_contacted_at || (co.last_contacted_at as string) < (row.occurred_at as string))) {
            co.last_contacted_at = row.occurred_at;
          }
        }
        return row;
      });
      return out as never;
    },
    async update(table, match, patch) {
      for (const row of store[table]) {
        if (matches(row, match)) { Object.assign(row, patch); derive(table, row); }
      }
    },
    async upsert(table, row, onConflict) {
      const existing = store[table].find((r) => r[onConflict] === (row as Record<string, unknown>)[onConflict]);
      if (existing) Object.assign(existing, row); else store[table].push({ ...row });
    },
    async remove(table, match) {
      store[table] = store[table].filter((r) => !matches(r, match));
      if (table === "companies") {
        for (const t of ["contacts", "research", "interactions", "tasks", "stage_changes"]) {
          store[t] = store[t].filter((r) => store.companies.some((c) => c.id === r.company_id) || r.company_id == null);
        }
      }
    },
    async rpc(name, args) {
      if (name === "set_company_stage") {
        const co = store.companies.find((c) => c.id === args.p_company)!;
        const from = co.stage as Stage;
        const to = args.p_stage as Stage;
        if (to === "lost" && !String(args.p_reason ?? "").trim()) throw new Error("A reason is required to mark a prospect Lost.");
        co.stage = to; co.stage_changed_at = now();
        if (to === "lost") co.lost_reason = args.p_reason;
        logStage(co.id as string, from, to, (args.p_reason as string) ?? null);
      } else if (name === "undo_stage_change") {
        const ch = store.stage_changes.find((c) => c.id === args.p_change)!;
        const co = store.companies.find((c) => c.id === ch.company_id)!;
        if (co.stage !== ch.to_stage) throw new Error("The stage has changed since; move it by hand instead.");
        co.stage = ch.from_stage; ch.undone_at = now();
        logStage(co.id as string, ch.to_stage as Stage, ch.from_stage as Stage, "Undo");
      } else if (name === "reject_gmail_thread") {
        store.gmail_threads = store.gmail_threads.filter((t) => t.id !== args.p_thread);
      } else if (name === "disconnect_gmail") {
        const a = store.gmail_accounts.find((x) => x.id === args.p_account);
        if (a) a.status = "disconnected";
      } else if (name === "remove_sample_data") {
        const gone = new Set(store.companies.filter((c) => c.is_sample).map((c) => c.id));
        store.companies = store.companies.filter((c) => !c.is_sample);
        for (const t of ["contacts", "research", "interactions", "stage_changes"]) {
          store[t] = store[t].filter((r) => !gone.has(r.company_id as string));
        }
        store.tasks = store.tasks.filter((t) => !t.is_sample);
        store.templates = store.templates.filter((t) => !t.is_sample);
      }
      return null;
    },
    async invoke(fn, body) {
      if (fn === "gmail-sync" && body.action === "approve") {
        const t = store.gmail_threads.find((x) => x.id === body.thread_id);
        if (t) t.status = "paidi";
        return { logged: 1 } as never;
      }
      throw new Error("Demo mode: this needs the real back end. Sign in to the live app to use it.");
    },
  };
}

let demoPromise: Promise<Db> | null = null;
function target(): Promise<Db> {
  if (!DEMO) return Promise.resolve(live);
  return (demoPromise ??= demoDb());
}

export const db: Db = {
  list: async (t) => (await target()).list(t),
  insert: async (t, rows) => (await target()).insert(t, rows),
  update: async (t, m, p) => (await target()).update(t, m, p),
  upsert: async (t, r, c) => (await target()).upsert(t, r, c),
  remove: async (t, m) => (await target()).remove(t, m),
  rpc: async (n, a) => (await target()).rpc(n, a),
  invoke: async (f, b) => (await target()).invoke(f, b),
};
