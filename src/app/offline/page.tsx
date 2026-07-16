"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { CloudOff } from "lucide-react";
import { offlineDb } from "@/lib/offline/db";
import { OfflinePill, SyncProvider } from "@/lib/offline/sync-provider";
import { parseLimit, formatLimit } from "@/lib/compliance/limits";
import {
  TaskRowClient,
  type TaskRowData,
} from "@/app/(operator)/app/[site]/today/task-row-client";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Offline fallback (§16): served by the service worker when a navigation has
 * no network. Renders today's cached checks from Dexie — the operator keeps
 * working; the outbox drains on reconnect.
 */
function OfflineContent() {
  const t = useTranslations("offline");

  const siteId = useLiveQuery(
    async () => (await offlineDb.meta.get("lastSiteId"))?.value ?? null,
    [],
    null,
  );
  const checks = useLiveQuery(
    async () =>
      siteId
        ? offlineDb.checksCache.where("siteId").equals(siteId).toArray()
        : [],
    [siteId],
    [],
  );

  const rows: TaskRowData[] = (checks ?? []).map((check) => {
    let flow: TaskRowData["flow"] = "temp";
    let limitLabel = "";
    try {
      const limit = parseLimit(check.limitJson);
      flow = "coolFrom" in limit ? "cooling" : "checklist" in limit ? "checklist" : "temp";
      limitLabel = formatLimit(check.limitJson);
    } catch {
      flow = "temp";
    }
    return {
      taskId: check.taskId,
      siteId: check.siteId,
      name: check.cpName,
      dueLabel: "",
      tone: "later",
      category: check.category,
      isVerification: check.verifiesDeviation,
      isMissed: false,
      flow,
      limitJson: check.limitJson,
      limitLabel,
      checklistItems: check.checklistItems ?? [],
    };
  });

  return (
    <main className="mx-auto w-full max-w-xl flex-1 p-4 text-[18px]">
      <header className="mb-6 grid gap-2">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <CloudOff className="size-6 text-muted-foreground" />
          {t("fallbackTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("fallbackHint")}</p>
        <OfflinePill />
      </header>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-muted-foreground">
            {t("noCache")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2" data-testid="offline-task-list">
          {rows.map((row) => (
            <TaskRowClient key={row.taskId} task={row} />
          ))}
        </div>
      )}
    </main>
  );
}

export default function OfflinePage() {
  return (
    <SyncProvider>
      <OfflineContent />
    </SyncProvider>
  );
}
