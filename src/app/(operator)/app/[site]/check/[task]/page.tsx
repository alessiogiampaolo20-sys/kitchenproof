import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { pickText } from "@/lib/i18n/pick";
import { formatLimit, parseLimit } from "@/lib/compliance/limits";
import {
  ChecklistCheck,
  CoolingCheck,
  TempCheck,
  type ChecklistItemDef,
} from "./check-flows";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function CheckPage({
  params,
}: {
  params: Promise<{ site: string; task: string }>;
}) {
  const { site: siteId, task: taskId } = await params;
  const supabase = await createClient();

  const { data: task } = await supabase
    .from("tasks")
    .select(
      "id, status, due_at, verifies_deviation_id, control_point:control_points(id, name_i18n, category, limit_json, instructions_i18n, monitoring_method, equipment:equipment(id, name, photo_path))",
    )
    .eq("id", taskId)
    .eq("site_id", siteId)
    .maybeSingle();
  if (!task || !task.control_point) redirect(`/app/${siteId}/today`);
  if (task.status === "done") redirect(`/app/${siteId}/today`);

  const cp = task.control_point;
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  const limit = parseLimit(cp.limit_json);
  const isCooling = "coolFrom" in limit;
  const isChecklist = "checklist" in limit;

  let checklistItems: ChecklistItemDef[] = [];
  if (isChecklist) {
    if (cp.category === "cleaning") {
      const { data: areas } = await supabase
        .from("cleaning_areas")
        .select("id, name_i18n")
        .eq("site_id", siteId)
        .eq("active", true)
        .order("position");
      checklistItems = (areas ?? []).map((area) => ({
        key: area.id,
        label: pickText(area.name_i18n, locale),
      }));
    }
    if (checklistItems.length === 0) {
      checklistItems = [
        {
          key: "main",
          label: pickText(cp.instructions_i18n, locale) || pickText(cp.name_i18n, locale),
        },
      ];
    }
  }

  let equipmentPhotoUrl: string | null = null;
  if (cp.equipment?.photo_path) {
    const { data } = await supabase.storage
      .from("photos")
      .createSignedUrl(cp.equipment.photo_path, 3600);
    equipmentPhotoUrl = data?.signedUrl ?? null;
  }

  return (
    // Kitchen mode (§15.1)
    <main className="mx-auto w-full max-w-md flex-1 p-4 text-[18px]">
      <Link
        href={`/app/${siteId}/today`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("nav.today")}
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
            {pickText(cp.name_i18n, locale)}
            {cp.equipment ? (
              <span className="text-muted-foreground">— {cp.equipment.name}</span>
            ) : null}
          </CardTitle>
          {task.verifies_deviation_id ? (
            <Badge variant="destructive" className="w-fit">
              <ShieldAlert className="size-3" /> {t("check.verification")}
            </Badge>
          ) : null}
          {/* reference photo so units are never mixed up (§8.2) */}
          {equipmentPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={equipmentPhotoUrl}
              alt={cp.equipment?.name ?? ""}
              className="mt-2 h-32 w-full rounded-lg object-cover"
            />
          ) : null}
        </CardHeader>
        <CardContent>
          {isCooling ? (
            <CoolingCheck
              siteId={siteId}
              taskId={task.id}
              limitJson={cp.limit_json}
              limitLabel={formatLimit(cp.limit_json)}
            />
          ) : isChecklist ? (
            <ChecklistCheck
              siteId={siteId}
              taskId={task.id}
              limitJson={cp.limit_json}
              items={checklistItems}
            />
          ) : (
            <TempCheck
              siteId={siteId}
              taskId={task.id}
              limitJson={cp.limit_json}
              limitLabel={formatLimit(cp.limit_json)}
            />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
