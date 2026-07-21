"use client";

// Who am I / what can I do: account identity, role and language, one tap away
// on every site screen. Plain state toggle (no Radix popover — touch-safe).
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CircleUserRound, LogOut } from "lucide-react";
import { signOut } from "@/app/_actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function ProfileMenu({
  name,
  email,
  roleLabel,
  orgName,
  siteName,
  localeSwitcher,
}: {
  name: string;
  email: string;
  roleLabel: string;
  orgName: string;
  siteName: string;
  localeSwitcher: React.ReactNode;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={t("profile.title")}
        aria-expanded={open}
        data-testid="profile-menu-button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-12 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"
      >
        <CircleUserRound className="size-6" />
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            data-testid="profile-menu-panel"
            className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border bg-background p-4 shadow-lg"
          >
            <p className="truncate font-medium">{name}</p>
            <p className="truncate text-sm text-muted-foreground">{email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge>{roleLabel}</Badge>
              <span className="min-w-0 truncate text-sm text-muted-foreground">
                {orgName} · {siteName}
              </span>
            </div>
            <div className="mt-3 border-t pt-3">{localeSwitcher}</div>
            <div className="mt-3 grid gap-2 border-t pt-3">
              <Button asChild variant="outline" className="justify-start">
                <Link href="/" onClick={() => setOpen(false)}>
                  {t("nav.chooseSite")}
                </Link>
              </Button>
              <form action={signOut}>
                <Button
                  variant="ghost"
                  type="submit"
                  className="w-full justify-start text-destructive"
                >
                  <LogOut className="size-4" />
                  {t("auth.signOut")}
                </Button>
              </form>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
