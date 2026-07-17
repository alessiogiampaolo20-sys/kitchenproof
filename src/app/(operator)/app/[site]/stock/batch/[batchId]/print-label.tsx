"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Printer } from "lucide-react";
import { markLabelPrinted } from "../../_actions";
import { Button } from "@/components/ui/button";

/** §9.2: browser-print label (AirPrint/Zebra-compatible via print CSS). */
export function PrintLabelButton({
  siteId,
  batchId,
  alreadyPrinted,
}: {
  siteId: string;
  batchId: string;
  alreadyPrinted: boolean;
}) {
  const t = useTranslations("stock");
  const [, startTransition] = useTransition();

  function print() {
    window.print();
    startTransition(async () => {
      await markLabelPrinted({ siteId, batchId });
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="min-h-14 w-full"
      onClick={print}
      data-testid="print-label"
    >
      <Printer className="size-4" />
      {alreadyPrinted ? t("reprintLabel") : t("printLabel")}
    </Button>
  );
}
