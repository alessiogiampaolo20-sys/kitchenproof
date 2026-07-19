import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarCheck,
  ClipboardList,
  PackagePlus,
  Refrigerator,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LocaleSwitcher } from "@/components/locale-switcher";

export async function SiteNav({
  siteId,
  active,
}: {
  siteId: string;
  active:
    | "today"
    | "programme"
    | "equipment"
    | "deviations"
    | "reports"
    | "receive"
    | "stock";
}) {
  const t = await getTranslations();
  const tabs = [
    { key: "today" as const, href: `/app/${siteId}/today`, label: t("nav.today"), icon: CalendarCheck },
    { key: "receive" as const, href: `/app/${siteId}/receive`, label: t("nav2.receive"), icon: PackagePlus },
    { key: "stock" as const, href: `/app/${siteId}/stock`, label: t("nav2.stock"), icon: Boxes },
    { key: "deviations" as const, href: `/app/${siteId}/deviations`, label: t("nav2.deviations"), icon: AlertTriangle },
    { key: "reports" as const, href: `/app/${siteId}/reports`, label: t("nav2.reports"), icon: BarChart3 },
    { key: "programme" as const, href: `/app/${siteId}/programme`, label: t("nav.programme"), icon: ClipboardList },
    { key: "equipment" as const, href: `/app/${siteId}/equipment`, label: t("nav.equipment"), icon: Refrigerator },
  ];
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={cn(
            "inline-flex min-h-12 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium",
            active === tab.key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          <tab.icon className="size-4" />
          {tab.label}
        </Link>
      ))}
      <LocaleSwitcher className="ml-auto shrink-0" />
    </nav>
  );
}
