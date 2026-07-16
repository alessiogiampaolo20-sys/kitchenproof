"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  Bug,
  ChevronRight,
  ClipboardCheck,
  HandHeart,
  PackageCheck,
  Sparkles,
  Thermometer,
} from "lucide-react";
import {
  ChecklistCheck,
  CoolingCheck,
  TempCheck,
} from "../check/[task]/check-flows";
import { useSync } from "@/lib/offline/sync-provider";
import { offlineDb, type CachedCheck } from "@/lib/offline/db";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS = {
  temperature: Thermometer,
  cleaning: Sparkles,
  receiving: PackageCheck,
  pest: Bug,
  hygiene: HandHeart,
  other: ClipboardCheck,
} as const;

export type TaskRowData = {
  taskId: string;
  siteId: string;
  name: string;
  dueLabel: string;
  tone: "overdue" | "now" | "later" | "done";
  category: string;
  isVerification: boolean;
  isMissed: boolean;
  flow: "temp" | "checklist" | "cooling";
  limitJson: unknown;
  limitLabel: string;
  checklistItems: { key: string; label: string }[];
};

export function TaskRowClient({ task }: { task: TaskRowData }) {
  const t = useTranslations();
  const router = useRouter();
  const { online } = useSync();
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [queuedDone, setQueuedDone] = useState(false);

  const category = (task.category ?? "other") as keyof typeof CATEGORY_ICONS;
  const Icon = CATEGORY_ICONS[category] ?? ClipboardCheck;
  const tone = queuedDone ? "done" : task.tone;

  const card = (
    <Card
      className={cn(
        "transition-colors",
        tone === "overdue" && "border-destructive/50",
        tone === "done" ? "opacity-60" : "cursor-pointer hover:border-primary",
      )}
      data-testid={`task-${tone}`}
      onClick={() => {
        if (tone === "done") return;
        if (online) {
          router.push(`/app/${task.siteId}/check/${task.taskId}`);
        } else {
          setOfflineOpen(true); // §16: no navigation, run the flow inline
        }
      }}
    >
      <CardContent className="flex min-h-14 items-center gap-3 py-3">
        <Icon
          className={cn(
            "size-6 shrink-0",
            tone === "overdue" ? "text-destructive" : "text-primary",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{task.name}</p>
          <p className="text-sm text-muted-foreground">
            {task.dueLabel}
            {task.isVerification ? ` · ${t("check.verification")}` : ""}
            {task.isMissed ? ` · ${t("todayScreen.logLate")}` : ""}
          </p>
        </div>
        {tone !== "done" ? <ChevronRight className="size-5 text-muted-foreground" /> : null}
      </CardContent>
    </Card>
  );

  const done = () => {
    setOfflineOpen(false);
    setQueuedDone(true);
  };

  return (
    <>
      {card}
      {offlineOpen ? (
        <Dialog open onOpenChange={setOfflineOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{task.name}</DialogTitle>
            </DialogHeader>
            {task.flow === "cooling" ? (
              <CoolingCheck
                siteId={task.siteId}
                taskId={task.taskId}
                limitJson={task.limitJson}
                limitLabel={task.limitLabel}
                onDone={done}
              />
            ) : task.flow === "checklist" ? (
              <ChecklistCheck
                siteId={task.siteId}
                taskId={task.taskId}
                limitJson={task.limitJson}
                items={task.checklistItems}
                onDone={done}
              />
            ) : (
              <TempCheck
                siteId={task.siteId}
                taskId={task.taskId}
                limitJson={task.limitJson}
                limitLabel={task.limitLabel}
                onDone={done}
              />
            )}
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

/** Section wrapper with the warning header used for the overdue rail. */
export function OverdueHeader() {
  const t = useTranslations("todayScreen");
  return (
    <h2 className="flex items-center gap-2 font-medium text-destructive">
      <AlertTriangle className="size-5" /> {t("overdue")}
    </h2>
  );
}

/** Mirrors today's actionable checks into Dexie for the offline fallback page (§16). */
export function OfflineCacheMirror({
  siteId,
  checks,
}: {
  siteId: string;
  checks: Omit<CachedCheck, "cachedAt">[];
}) {
  useEffect(() => {
    void (async () => {
      await offlineDb.meta.put({ key: "lastSiteId", value: siteId });
      // replace this site's cache with the fresh server truth
      await offlineDb.checksCache.where("siteId").equals(siteId).delete();
      if (checks.length > 0) {
        await offlineDb.checksCache.bulkPut(
          checks.map((check) => ({ ...check, cachedAt: Date.now() })),
        );
      }
    })();
  }, [siteId, checks]);
  return null;
}
