import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext, MANAGER_ROLES } from "@/lib/tenancy";
import { WizardChat } from "./wizard-chat";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function WizardPage({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
  const { site: siteId } = await params;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id, name")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) redirect("/");
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx || !MANAGER_ROLES.includes(ctx.role)) redirect(`/app/${siteId}/programme`);

  const t = await getTranslations("wizard");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t("hint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <WizardChat siteId={siteId} />
        </CardContent>
      </Card>
    </main>
  );
}

// AI extractions can run long — lift the Vercel function limit (fluid compute).
export const maxDuration = 300;
