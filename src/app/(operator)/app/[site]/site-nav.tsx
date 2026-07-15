import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarCheck, ClipboardList, Refrigerator } from "lucide-react";
import { cn } from "@/lib/utils";

export async function SiteNav({
  siteId,
  active,
}: {
  siteId: string;
  active: "today" | "programme" | "equipment";
}) {
  const t = await getTranslations("nav");
  const tabs = [
    { key: "today" as const, href: `/app/${siteId}/today`, label: t("today"), icon: CalendarCheck },
    { key: "programme" as const, href: `/app/${siteId}/programme`, label: t("programme"), icon: ClipboardList },
    { key: "equipment" as const, href: `/app/${siteId}/equipment`, label: t("equipment"), icon: Refrigerator },
  ];
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={cn(
            "inline-flex min-h-12 items-center gap-2 rounded-xl px-4 text-sm font-medium",
            active === tab.key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          <tab.icon className="size-4" />
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
