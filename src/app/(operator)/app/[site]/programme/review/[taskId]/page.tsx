import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ScrollText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext, MANAGER_ROLES } from "@/lib/tenancy";
import { loadPackVersion } from "@/lib/compliance/pack";
import { pickText } from "@/lib/i18n/pick";
import type { PackDiffItem } from "@/lib/compliance/pack-update";
import { SiteNav } from "../../../site-nav";
import { ReviewItemCard } from "./review-item";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type DiffPayload = { fromVersion: string; toVersion: string; items: PackDiffItem[] };

export default async function ReviewTaskPage({
  params,
}: {
  params: Promise<{ site: string; taskId: string }>;
}) {
  const { site: siteId, taskId } = await params;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id, compliance_pack")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) redirect("/");
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx) redirect("/");
  const isManager = MANAGER_ROLES.includes(ctx.role);

  const { data: task } = await supabase
    .from("site_review_tasks")
    .select("id, status, diff_json, due_at, update:regulatory_updates(summary_i18n)")
    .eq("id", taskId)
    .eq("site_id", siteId)
    .maybeSingle();
  if (!task || !task.diff_json) redirect(`/app/${siteId}/programme`);
  const diff = task.diff_json as unknown as DiffPayload;

  // CP display names from the NEW pack version
  const { pack } = await loadPackVersion(supabase, site.compliance_pack);
  const nameByKey = new Map(
    pack.controlPointTemplates.map((tpl) => [tpl.key, tpl.name]),
  );

  const [t, locale] = await Promise.all([
    getTranslations("review"),
    getLocale(),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4">
      <SiteNav siteId={siteId} active="programme" />
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="size-5 text-primary" />
            {t("title", { from: diff.fromVersion, to: diff.toVersion })}
            <Badge
              variant={task.status === "resolved" ? "default" : "secondary"}
              data-testid="review-status"
            >
              {t(`status.${task.status}`)}
            </Badge>
          </CardTitle>
          <CardDescription>
            {pickText(task.update?.summary_i18n ?? null, locale)}
            {task.due_at ? ` · ${t("dueBy", { date: task.due_at.slice(0, 10) })}` : ""}
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-3">
        {diff.items.map((item) => (
          <ReviewItemCard
            key={`${item.key}-${item.kind}`}
            siteId={siteId}
            taskId={taskId}
            item={item}
            cpName={
              pickText((nameByKey.get(item.key) ?? null) as never, locale) || item.key
            }
            readonly={!isManager || task.status !== "open"}
          />
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{t("r9Hint")}</p>
    </main>
  );
}
