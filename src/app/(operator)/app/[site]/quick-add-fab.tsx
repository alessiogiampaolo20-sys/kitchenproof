"use client";

// Quick-add FAB (bottom-right, thumb reach on phones): the fast path into the
// registration flows — invoice, quick receive, prep batch, outbound delivery.
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CookingPot, FileText, PackagePlus, Plus, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

export function QuickAddFab({ siteId }: { siteId: string }) {
  const t = useTranslations("quickAdd");
  const [open, setOpen] = useState(false);

  const actions = [
    { key: "invoice", href: `/app/${siteId}/receive`, icon: FileText, label: t("invoice") },
    { key: "quickReceive", href: `/app/${siteId}/receive/quick`, icon: PackagePlus, label: t("quickReceive") },
    { key: "prep", href: `/app/${siteId}/stock/prep`, icon: CookingPot, label: t("prep") },
    { key: "outbound", href: `/app/${siteId}/stock/outbound`, icon: Truck, label: t("outbound") },
  ];

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          className="fixed inset-0 z-40 cursor-default bg-black/20"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
        {open
          ? actions.map((action) => (
              <Link
                key={action.key}
                href={action.href}
                onClick={() => setOpen(false)}
                className="inline-flex min-h-12 items-center gap-2 rounded-full border bg-background px-4 text-sm font-medium shadow-lg"
                data-testid={`fab-${action.key}`}
              >
                <action.icon className="size-4 text-primary" />
                {action.label}
              </Link>
            ))
          : null}
        <button
          type="button"
          aria-label={t("label")}
          aria-expanded={open}
          data-testid="quick-add-fab"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform",
            open && "rotate-45",
          )}
        >
          <Plus className="size-7" />
        </button>
      </div>
    </>
  );
}
