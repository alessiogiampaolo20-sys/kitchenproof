import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MessageCircleQuestion } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/tenancy";
import { AssistantChat } from "./assistant-chat";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function AssistantPage({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
  const { site: siteId } = await params;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) redirect("/");
  const ctx = await getOrgContext(supabase, site.org_id);
  if (!ctx) redirect("/");

  const t = await getTranslations("assistant");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircleQuestion className="size-5 text-primary" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t("hint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* §13: clearly labelled guidance, not legal advice */}
          <p className="text-xs text-muted-foreground" data-testid="assistant-disclaimer">
            {t("disclaimer")}
          </p>
        </CardContent>
      </Card>
      <AssistantChat siteId={siteId} />
    </main>
  );
}

// AI extractions can run long — lift the Vercel function limit (fluid compute).
export const maxDuration = 300;
