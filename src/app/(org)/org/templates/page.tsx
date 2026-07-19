import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LayoutTemplate } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/org-context";
import { TemplatesClient } from "./templates-client";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function TemplatesPage() {
  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/");
  const supabase = await createClient();

  const [{ data: templates }, { data: sites }] = await Promise.all([
    supabase
      .from("org_programme_templates")
      .select("id, name, created_at, source:sites!org_programme_templates_source_site_id_fkey(name)")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("sites")
      .select("id, name")
      .eq("org_id", orgId)
      .neq("status", "archived")
      .order("name"),
  ]);

  const t = await getTranslations("templates");

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutTemplate className="size-5 text-primary" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t("hint")}</CardDescription>
        </CardHeader>
      </Card>
      <TemplatesClient
        templates={(templates ?? []).map((template) => ({
          id: template.id,
          name: template.name,
          sourceName: template.source?.name ?? "",
          createdAt: template.created_at,
        }))}
        sites={sites ?? []}
      />
    </div>
  );
}
