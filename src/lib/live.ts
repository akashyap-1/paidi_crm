// Live updates: when another team member changes a row, refetch that table so
// every open browser shows the change within a second or two.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { DEMO, supabase } from "./db";
import type { TableName } from "./types";

/** Tables in the supabase_realtime publication (see migrations). */
const LIVE_TABLES: TableName[] = ["tasks"];

export function useLiveTables() {
  const qc = useQueryClient();

  useEffect(() => {
    if (DEMO) return;
    let connectedOnce = false;
    const channel = supabase.channel("crm-live");
    for (const table of LIVE_TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        void qc.invalidateQueries({ queryKey: [table] });
      });
    }
    channel.subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      // After a dropped connection (sleep, Wi-Fi change), catch up on anything missed.
      if (connectedOnce) for (const table of LIVE_TABLES) void qc.invalidateQueries({ queryKey: [table] });
      connectedOnce = true;
    });
    return () => { void supabase.removeChannel(channel); };
  }, [qc]);
}
