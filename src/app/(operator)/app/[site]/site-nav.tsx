"use client";

// Client nav mounted ONCE in the [site] layout: it survives page navigations,
// so the horizontal scroll position never jumps between taps (the old
// per-page server nav re-rendered from scroll 0 on every navigation).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarCheck,
  ClipboardList,
  Home,
  PackagePlus,
  Refrigerator,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function SiteNav({ siteId }: { siteId: string }) {
  const t = useTranslations();
  const pathname = usePathname();
  const tabs = [
    { key: "today", href: `/app/${siteId}/today`, label: t("nav.today"), icon: CalendarCheck },
    { key: "receive", href: `/app/${siteId}/receive`, label: t("nav2.receive"), icon: PackagePlus },
    { key: "stock", href: `/app/${siteId}/stock`, label: t("nav2.stock"), icon: Boxes },
    { key: "deviations", href: `/app/${siteId}/deviations`, label: t("nav2.deviations"), icon: AlertTriangle },
    { key: "reports", href: `/app/${siteId}/reports`, label: t("nav2.reports"), icon: BarChart3 },
    { key: "programme", href: `/app/${siteId}/programme`, label: t("nav.programme"), icon: ClipboardList },
    { key: "equipment", href: `/app/${siteId}/equipment`, label: t("nav.equipment"), icon: Refrigerator },
  ];
  return (
    <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-2">
      <Link
        href="/"
        aria-label={t("nav.chooseSite")}
        className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"
      >
        <Home className="size-5" />
      </Link>
      {tabs.map((tab) => {
        const active =
          pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={cn(
              "inline-flex min-h-12 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            <tab.icon className="size-4" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
