"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Rocket } from "lucide-react";
import {
  createTemplate,
  deployTemplate,
  type DeployState,
  type TemplateActionState,
} from "./_actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function TemplatesClient({
  templates,
  sites,
}: {
  templates: { id: string; name: string; sourceName: string; createdAt: string }[];
  sites: { id: string; name: string }[];
}) {
  const t = useTranslations("templates");
  const router = useRouter();
  const [name, setName] = useState("");
  const [sourceSiteId, setSourceSiteId] = useState(sites[0]?.id ?? "");
  const [targetBySite, setTargetBySite] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    setError(null);
    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("sourceSiteId", sourceSiteId);
    startTransition(async () => {
      const result: TemplateActionState = await createTemplate(null, formData);
      if (result && "ok" in result) {
        toast.success(t("createdToast"));
        setName("");
        router.refresh();
      } else {
        setError(result && "error" in result ? result.error : "error");
      }
    });
  }

  function deploy(templateId: string) {
    const targetSiteId = targetBySite.get(templateId);
    if (!targetSiteId) return;
    setError(null);
    startTransition(async () => {
      const result: DeployState = await deployTemplate({ templateId, targetSiteId });
      if (result && "ok" in result) {
        toast.success(
          result.mode === "draft" ? t("deployedDraftToast") : t("deployedProposalToast"),
        );
        router.refresh();
      } else {
        setError(result && "error" in result ? result.error : "error");
      }
    });
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-3 py-4">
          <Label>{t("createTitle")}</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              className="min-h-12 flex-1"
              data-testid="template-name"
            />
            <Select value={sourceSiteId} onValueChange={setSourceSiteId}>
              <SelectTrigger className="min-h-12 w-56" data-testid="template-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="min-h-12"
              disabled={pending || !name.trim() || !sourceSiteId}
              onClick={create}
              data-testid="create-template"
            >
              {t("createButton")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {templates.map((template) => (
        <Card key={template.id} data-testid={`template-${template.id}`}>
          <CardContent className="flex flex-wrap items-center gap-2 py-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{template.name}</p>
              <p className="text-xs text-muted-foreground">
                {t("sourceLabel", { site: template.sourceName })} ·{" "}
                {template.createdAt.slice(0, 10)}
              </p>
            </div>
            <Select
              value={targetBySite.get(template.id) ?? ""}
              onValueChange={(value) =>
                setTargetBySite((prev) => new Map(prev).set(template.id, value))
              }
            >
              <SelectTrigger className="min-h-12 w-52" data-testid={`deploy-target-${template.id}`}>
                <SelectValue placeholder={t("targetPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="min-h-12"
              disabled={pending || !targetBySite.get(template.id)}
              onClick={() => deploy(template.id)}
              data-testid={`deploy-${template.id}`}
            >
              <Rocket className="size-4" />
              {t("deployButton")}
            </Button>
          </CardContent>
        </Card>
      ))}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {t(`errors.${error}`)}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">{t("r9Hint")}</p>
    </div>
  );
}
