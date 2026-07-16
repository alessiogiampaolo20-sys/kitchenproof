"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { AdHocDialog } from "../check/[task]/check-flows";
import { Button } from "@/components/ui/button";

export function AdHocLauncher({
  siteId,
  equipment,
}: {
  siteId: string;
  equipment: { id: string; name: string }[];
}) {
  const t = useTranslations("todayScreen");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size="lg"
        variant="outline"
        className="min-h-14 w-full border-dashed"
        onClick={() => setOpen(true)}
        data-testid="adhoc-open"
      >
        <Plus /> {t("adHoc")}
      </Button>
      <AdHocDialog
        siteId={siteId}
        equipment={equipment}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
