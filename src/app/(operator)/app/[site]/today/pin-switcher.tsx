"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Delete, Lock, UserRound } from "lucide-react";
import { verifyPin } from "./_actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type SwitcherMember = {
  membershipId: string;
  fullName: string;
  hasPin: boolean;
  locked: boolean;
};

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

/**
 * §15: PIN identity switcher — avatar grid, 1 tap + 4 digits. Big-touch
 * keypad (≥56px targets), never the OS keyboard.
 */
export function PinSwitcher({
  siteId,
  members,
}: {
  siteId: string;
  members: SwitcherMember[];
}) {
  const t = useTranslations("pin");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<SwitcherMember | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setSelected(null);
    setPin("");
    setError(null);
  }

  function submit(candidate: string, member: SwitcherMember) {
    startTransition(async () => {
      const result = await verifyPin({
        membershipId: member.membershipId,
        siteId,
        pin: candidate,
      });
      setPin("");
      if ("ok" in result) {
        toast.success(`${t("switched")} — ${result.fullName}`);
        setOpen(false);
        reset();
        router.refresh();
      } else if (result.error === "wrongPin") {
        setError(t("wrongPin", { remaining: result.remaining }));
      } else if (result.error === "locked") {
        setError(t("locked"));
      } else if (result.error === "noPin") {
        setError(t("noPin"));
      } else {
        setError(t("enterPin"));
      }
    });
  }

  function press(digit: string) {
    if (!selected || pending) return;
    const next = (pin + digit).slice(0, 4);
    setPin(next);
    setError(null);
    if (next.length === 4) {
      submit(next, selected);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" className="min-h-14">
          <UserRound /> {t("switchUser")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        {!selected ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("whoAreYou")}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-3 gap-3 py-2">
              {members.map((m) => (
                <button
                  key={m.membershipId}
                  type="button"
                  disabled={!m.hasPin}
                  onClick={() => setSelected(m)}
                  className={cn(
                    "flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border p-3 transition-colors",
                    m.hasPin
                      ? "hover:border-primary hover:bg-muted/50"
                      : "opacity-40",
                  )}
                  data-testid={`pin-member-${m.membershipId}`}
                >
                  <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                    {m.locked ? <Lock className="size-6" /> : initials(m.fullName)}
                  </span>
                  <span className="max-w-full truncate text-sm font-medium">
                    {m.fullName}
                  </span>
                  {!m.hasPin ? (
                    <span className="text-xs text-muted-foreground">
                      {t("noPin")}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {selected.fullName} — {t("enterPin")}
              </DialogTitle>
            </DialogHeader>
            <div
              className="flex justify-center gap-3 py-2"
              data-testid="pin-dots"
            >
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={cn(
                    "size-4 rounded-full border-2 border-primary",
                    pin.length > i ? "bg-primary" : "bg-transparent",
                  )}
                />
              ))}
            </div>
            {error ? (
              <p className="text-center text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <Button
                  key={d}
                  type="button"
                  variant="secondary"
                  className="h-16 text-2xl font-semibold"
                  disabled={pending}
                  onClick={() => press(d)}
                  data-testid={`pin-key-${d}`}
                >
                  {d}
                </Button>
              ))}
              <Button
                type="button"
                variant="ghost"
                className="h-16"
                disabled={pending}
                onClick={reset}
              >
                {t("switchUser")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-16 text-2xl font-semibold"
                disabled={pending}
                onClick={() => press("0")}
                data-testid="pin-key-0"
              >
                0
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-16"
                disabled={pending}
                onClick={() => setPin(pin.slice(0, -1))}
                aria-label="backspace"
              >
                <Delete className="size-6" />
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
