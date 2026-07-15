"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { revokeMember, setMemberPin, unlockMemberPin } from "./_actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function SetPinDialog({
  membershipId,
  memberName,
}: {
  membershipId: string;
  memberName: string;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await setMemberPin(null, formData);
      if (result && "ok" in result) {
        toast.success(t("members.pinSaved"));
        setError(null);
        setOpen(false);
      } else {
        setError("error");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t("members.setPin")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {t("members.setPin")} — {memberName}
          </DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-4">
          <input type="hidden" name="membershipId" value={membershipId} />
          <div className="grid gap-2">
            <Label htmlFor={`pin-${membershipId}`}>
              {t("members.pinLabel")}
            </Label>
            <Input
              id={`pin-${membershipId}`}
              name="pin"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              required
              autoComplete="off"
              className="text-center text-2xl tracking-[0.5em]"
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {t(`common.${error}`)}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UnlockPinButton({ membershipId }: { membershipId: string }) {
  const t = useTranslations();
  return (
    <form
      action={async (formData) => {
        await unlockMemberPin(formData);
        toast.success(t("members.pinUnlocked"));
      }}
    >
      <input type="hidden" name="membershipId" value={membershipId} />
      <Button variant="outline" size="sm" type="submit">
        {t("members.unlockPin")}
      </Button>
    </form>
  );
}

export function RevokeButton({ membershipId }: { membershipId: string }) {
  const t = useTranslations();
  return (
    <form
      action={async (formData) => {
        await revokeMember(formData);
        toast.success(t("members.revoked"));
      }}
    >
      <input type="hidden" name="membershipId" value={membershipId} />
      <Button variant="ghost" size="sm" type="submit" className="text-destructive">
        {t("members.revoke")}
      </Button>
    </form>
  );
}
