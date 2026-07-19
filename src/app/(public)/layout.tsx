import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";

export default async function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const t = await getTranslations("common");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <h1 className="text-2xl font-semibold tracking-tight text-primary">
        {t("appName")}
      </h1>
      <div className="w-full max-w-sm">{children}</div>
      <LocaleSwitcher />
    </main>
  );
}
