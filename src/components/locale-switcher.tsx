import { getLocale } from "next-intl/server";
import { Languages } from "lucide-react";
import { setLocale } from "@/app/_actions";
import { LOCALES } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

/**
 * Always-available language selector (da default, en/it one tap away).
 * Server-action form — works on every surface, no client JS required.
 */
export async function LocaleSwitcher({ className }: { className?: string }) {
  const current = await getLocale();
  return (
    <form
      action={setLocale}
      className={cn("flex items-center gap-1", className)}
      data-testid="locale-switcher"
    >
      <Languages className="size-4 text-muted-foreground" aria-hidden />
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="submit"
          name="locale"
          value={locale}
          data-testid={`locale-${locale}`}
          className={cn(
            "min-h-9 rounded-md px-2 text-sm font-medium uppercase",
            locale === current
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {locale}
        </button>
      ))}
    </form>
  );
}
