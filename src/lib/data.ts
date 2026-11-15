// React Query hooks over the data-access layer. The data set is small (a few
// hundred rows), so each table is loaded whole and filtered in the browser.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { db } from "./db";
import type { Stage, TableName, Tables } from "./types";

export function useTable<T extends TableName>(table: T) {
  const q = useQuery({ queryKey: [table], queryFn: () => db.list(table) });
  return { rows: (q.data ?? []) as Tables[T][], loading: q.isLoading, error: q.error as Error | null };
}

/** All the tables most screens need, plus lookup maps. */
export function useCrm() {
  const team = useTable("allowed_users");
  const companies = useTable("companies");
  const contacts = useTable("contacts");
  const interactions = useTable("interactions");
  const tasks = useTable("tasks");
  const templates = useTable("templates");
  const stageChanges = useTable("stage_changes");
  const research = useTable("research");
  const settings = useTable("settings");

  const maps = useMemo(() => ({
    member: new Map(team.rows.map((m) => [m.id, m])),
    company: new Map(companies.rows.map((c) => [c.id, c])),
    contact: new Map(contacts.rows.map((c) => [c.id, c])),
    template: new Map(templates.rows.map((t) => [t.id, t])),
  }), [team.rows, companies.rows, contacts.rows, templates.rows]);

  const setting = (key: string, fallback: number): number => {
    const v = settings.rows.find((s) => s.key === key)?.value;
    return typeof v === "number" ? v : Number(v ?? fallback) || fallback;
  };

  const all = [team, companies, contacts, interactions, tasks, templates, stageChanges, research];
  return {
    team: team.rows, companies: companies.rows, contacts: contacts.rows,
    interactions: interactions.rows, tasks: tasks.rows, templates: templates.rows,
    stageChanges: stageChanges.rows, research: research.rows, settings: settings.rows,
    ...maps,
    followupDays: setting("followup_days", 3),
    maxTouches: setting("max_touches", 3),
    loading: all.some((t) => t.loading),
    error: all.find((t) => t.error)?.error ?? null,
  };
}

/** Insert / update / delete for any table; refreshes the affected queries. */
export function useWrite() {
  const qc = useQueryClient();
  const refresh = (...tables: TableName[]) =>
    Promise.all(tables.map((t) => qc.invalidateQueries({ queryKey: [t] })));

  return {
    refresh,
    insert: async <T extends TableName>(table: T, rows: Partial<Tables[T]>[]) => {
      const out = await db.insert(table, rows);
      await refresh(table, ...(table === "companies" ? ["stage_changes" as const] : []),
        ...(table === "interactions" ? ["companies" as const] : []));
      return out;
    },
    update: async <T extends TableName>(table: T, match: Record<string, string>, patch: Partial<Tables[T]>) => {
      await db.update(table, match, patch);
      await refresh(table);
    },
    upsert: async <T extends TableName>(table: T, row: Partial<Tables[T]>, onConflict: string) => {
      await db.upsert(table, row, onConflict);
      await refresh(table);
    },
    remove: async (table: TableName, match: Record<string, string>) => {
      await db.remove(table, match);
      await refresh(table, "contacts", "interactions", "tasks", "research", "stage_changes");
    },
    rpc: async (name: string, args: Record<string, unknown>, ...tables: TableName[]) => {
      const out = await db.rpc(name, args);
      await refresh(...tables);
      return out;
    },
  };
}

/** Moves a company to a stage with an optimistic update, so drag-and-drop feels instant. */
export function useMoveStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { companyId: string; stage: Stage; reason?: string }) =>
      db.rpc("set_company_stage", { p_company: v.companyId, p_stage: v.stage, p_reason: v.reason ?? null }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["companies"] });
      const previous = qc.getQueryData<Tables["companies"][]>(["companies"]);
      qc.setQueryData<Tables["companies"][]>(["companies"], (rows) =>
        rows?.map((c) => (c.id === v.companyId ? { ...c, stage: v.stage } : c)));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(["companies"], ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["stage_changes"] });
    },
  });
}
