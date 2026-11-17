// Live updates: when anyone changes a row, refetch that table so every open
// browser shows the change within a second or two.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { DEMO, supabase } from "./db";
import type { TableName } from "./types";

/** Every table in the supabase_realtime publication (see migrations). */
const LIVE_TABLES: TableName[] = [
  "tasks", "companies", "contacts", "research", "templates", "interactions",
  "call_intel", "stage_changes", "settings", "allowed_users", "gmail_accounts", "gmail_threads",
];

/** Bulk changes (an import, an hourly job) arrive as bursts; refetch each table once per burst. */
const BURST_MS = 400;

export function useLiveTables() {
  const qc = useQueryClient();

  useEffect(() => {
    if (DEMO) return;
    const timers = new Map<TableName, ReturnType<typeof setTimeout>>();
    const refresh = (table: TableName) => {
      if (timers.has(table)) return;
      timers.set(table, setTimeout(() => {
        timers.delete(table);
        void qc.invalidateQueries({ queryKey: [table] });
      }, BURST_MS));
    };

    let connectedOnce = false;
    const channel = supabase.channel("crm-live");
    for (const table of LIVE_TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => refresh(table));
    }
    channel.subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      // After a dropped connection (sleep, Wi-Fi change), catch up on anything missed.
      if (connectedOnce) LIVE_TABLES.forEach(refresh);
      connectedOnce = true;
    });
    return () => {
      timers.forEach(clearTimeout);
      void supabase.removeChannel(channel);
    };
  }, [qc]);
}
