"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Ban, GraduationCap, LockOpen, Play, QrCode, Upload } from "lucide-react";
import QRCode from "qrcode";
import {
  createInspectorLink,
  endInspection,
  revokeInspectorLink,
  startInspection,
  uploadSiteDocument,
  type EndInspectionState,
  type InspectionActionState,
  type InspectorLinkState,
  type RevokeLinkState,
} from "./_actions";
import { INSPECTOR_LINK_HOURS } from "./link-options";
import { addTrainingRecord } from "../reports/_actions";
import { cn } from "@/lib/utils";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** §10.1 entry: hand over this device (guest lock) or share a magic link. */
export function EntryControls({
  siteId,
  isManager,
}: {
  siteId: string;
  isManager: boolean;
}) {
  const t = useTranslations("inspection");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [link, setLink] = useState<{ url: string; qr: string; expiresAt: string } | null>(null);
  const [hours, setHours] = useState<number>(INSPECTOR_LINK_HOURS[0]);
  const [pending, startTransition] = useTransition();

  function start() {
    startTransition(async () => {
      const result: InspectionActionState = await startInspection({ siteId });
      if (result && "ok" in result) {
        toast.success(t("startedToast"));
        router.refresh();
      } else if (result && "error" in result && result.error === "noManagerPin") {
        toast.error(t("noManagerPin"));
        setConfirming(false);
      } else {
        toast.error(t("error"));
      }
    });
  }

  function generateLink() {
    startTransition(async () => {
      const result: InspectorLinkState = await createInspectorLink({ siteId, hours });
      if (result && "ok" in result) {
        const qr = await QRCode.toDataURL(result.url, { margin: 1, width: 220 });
        setLink({ url: result.url, qr, expiresAt: result.expiresAt });
      } else {
        toast.error(t("error"));
      }
    });
  }

  return (
    <div className="grid gap-3">
      {!confirming ? (
        <Button
          size="lg"
          className="min-h-14"
          onClick={() => setConfirming(true)}
          data-testid="start-inspection"
        >
          <Play className="size-4" />
          {t("startButton")}
        </Button>
      ) : (
        <div className="grid gap-2 rounded-lg border p-3">
          <p className="text-sm">{t("confirmHint")}</p>
          <div className="flex gap-2">
            <Button
              size="lg"
              className="min-h-14 flex-1"
              disabled={pending}
              onClick={start}
              data-testid="confirm-inspection"
            >
              {t("confirmButton")}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="min-h-14"
              onClick={() => setConfirming(false)}
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}

      {isManager ? (
        <div className="grid gap-2">
          {/* the visit's length is the manager's call — chips, not a Radix
              Select: dropdowns ghost-click on touch devices */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("magicLinkDuration")}</span>
            {INSPECTOR_LINK_HOURS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setHours(option)}
                data-testid={`link-hours-${option}`}
                aria-pressed={hours === option}
                className={cn(
                  "min-h-12 rounded-xl px-4 text-sm font-medium",
                  hours === option
                    ? "bg-primary text-primary-foreground"
                    : "border text-muted-foreground",
                )}
              >
                {t("magicLinkHours", { hours: option })}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="lg"
            className="min-h-14"
            disabled={pending}
            onClick={generateLink}
            data-testid="generate-inspector-link"
          >
            <QrCode className="size-4" />
            {t("magicLinkButton")}
          </Button>
          {link ? (
            <div className="grid justify-items-center gap-2 rounded-lg border p-3" data-testid="inspector-link-panel">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={link.qr} alt="QR" className="size-44" />
              <p className="break-all font-mono text-xs" data-testid="inspector-link-url">
                {link.url}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("magicLinkExpiry", { time: link.expiresAt.slice(11, 16) })}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** §10.1 exit: manager PIN unlocks the device. */
export type ActiveLink = {
  id: string;
  expiresAt: string;
  createdAt: string;
  openedAt: string | null;
  views: number;
};

/**
 * Live inspector links: what is open right now, whether it was opened, and a
 * way to end it early. An owner who cannot see or stop an outstanding link is
 * trusting a URL they no longer control (§4.2).
 */
export function ActiveInspectorLinks({
  siteId,
  links,
}: {
  siteId: string;
  links: ActiveLink[];
}) {
  const t = useTranslations("inspection");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function revoke(linkId: string) {
    startTransition(async () => {
      const result: RevokeLinkState = await revokeInspectorLink({ siteId, linkId });
      if (result && "ok" in result) {
        toast.success(t("revokedToast"));
        router.refresh();
      } else {
        toast.error(t("error"));
      }
    });
  }

  if (links.length === 0) return null;

  return (
    <div className="grid gap-2" data-testid="active-links">
      <p className="text-sm font-medium">{t("activeLinksTitle")}</p>
      {links.map((link) => (
        <div
          key={link.id}
          className="flex flex-wrap items-center gap-2 rounded-lg border p-3"
          data-testid="active-link-row"
        >
          <div className="min-w-0 flex-1 text-sm">
            <p>{t("linkExpiresAt", { time: link.expiresAt.slice(11, 16) })}</p>
            <p className="text-muted-foreground">
              {link.openedAt
                ? t("linkOpened", { time: link.openedAt.slice(11, 16), views: link.views })
                : t("linkNotOpened")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="min-h-12 shrink-0"
            disabled={pending}
            onClick={() => revoke(link.id)}
            data-testid="revoke-link"
          >
            <Ban className="size-4" />
            {t("revokeButton")}
          </Button>
        </div>
      ))}
    </div>
  );
}

export function ExitLockDialog({
  siteId,
  managers,
}: {
  siteId: string;
  managers: { id: string; name: string }[];
}) {
  const t = useTranslations("inspection");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [membershipId, setMembershipId] = useState(managers[0]?.id ?? "");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function unlock() {
    setError(null);
    startTransition(async () => {
      const result: EndInspectionState = await endInspection({
        siteId,
        membershipId,
        pin,
      });
      if (result && "ok" in result) {
        toast.success(t("endedToast"));
        setOpen(false);
        router.push(`/app/${siteId}/today`);
        router.refresh();
      } else {
        setPin("");
        setError(result && "error" in result ? result.error : "error");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" data-testid="exit-inspection">
          <LockOpen className="size-4" />
          {t("exitButton")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("exitTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t("exitHint")}</p>
        <Select value={membershipId} onValueChange={setMembershipId}>
          <SelectTrigger className="min-h-12" data-testid="exit-manager">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {managers.map((manager) => (
              <SelectItem key={manager.id} value={manager.id}>
                {manager.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="••••"
          className="min-h-12 text-center font-mono text-lg"
          data-testid="exit-pin"
        />
        {error ? (
          <p className="text-sm text-destructive" role="alert" data-testid="exit-error">
            {t(`exitErrors.${error}`)}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            className="min-h-12"
            disabled={pending || pin.length !== 4 || !membershipId}
            onClick={unlock}
            data-testid="exit-confirm"
          >
            {t("exitConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** §10.2 tab 5: manager uploads (contracts, certificates, water tests…). */
export function UploadDocumentForm({ siteId }: { siteId: string }) {
  const t = useTranslations("inspection");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("pest_control");
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    formData.set("kind", kind);
    startTransition(async () => {
      const result = await uploadSiteDocument(null, formData);
      if (result && "ok" in result) {
        toast.success(t("documentUploadedToast"));
        setOpen(false);
        router.refresh();
      } else {
        toast.error(t("error"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" className="min-h-14" data-testid="upload-document">
          <Upload className="size-4" />
          {t("uploadDocumentButton")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("uploadDocumentTitle")}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-3">
          <input type="hidden" name="siteId" value={siteId} />
          <div className="grid gap-1">
            <Label>{t("documents.kindLabel")}</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="min-h-12"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["pest_control", "training_certificate", "water_test", "smiley_report", "other"].map(
                  (documentKind) => (
                    <SelectItem key={documentKind} value={documentKind}>
                      {t(`documents.kinds.${documentKind}`)}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="doc-title">{t("documents.titleLabel")}</Label>
            <Input id="doc-title" name="title" required className="min-h-12" data-testid="document-title" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="doc-valid">{t("documents.validUntil")}</Label>
            <Input id="doc-valid" name="validUntil" type="date" className="min-h-12" />
          </div>
          <Input name="file" type="file" required className="min-h-12" data-testid="document-file" />
          <DialogFooter>
            <Button type="submit" className="min-h-12" disabled={pending} data-testid="document-submit">
              {t("documents.upload")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** §13 training log entry (who, what, when, certificate photo). */
export function TrainingForm({ siteId }: { siteId: string }) {
  const t = useTranslations("training");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await addTrainingRecord(null, formData);
      if (result && "ok" in result) {
        toast.success(t("addedToast"));
        setOpen(false);
        router.refresh();
      } else {
        toast.error(t("error"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" className="min-h-14" data-testid="add-training">
          <GraduationCap className="size-4" />
          {t("addButton")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-3">
          <input type="hidden" name="siteId" value={siteId} />
          <div className="grid gap-1">
            <Label htmlFor="training-person">{t("personLabel")}</Label>
            <Input id="training-person" name="personName" required className="min-h-12" data-testid="training-person" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="training-course">{t("courseLabel")}</Label>
            <Input id="training-course" name="course" required className="min-h-12" data-testid="training-course" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="training-date">{t("dateLabel")}</Label>
            <Input id="training-date" name="trainedOn" type="date" required className="min-h-12" data-testid="training-date" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="training-cert">{t("certificateLabel")}</Label>
            <Input id="training-cert" name="certificate" type="file" accept="image/*,.pdf" className="min-h-12" />
          </div>
          <DialogFooter>
            <Button type="submit" className="min-h-12" disabled={pending} data-testid="training-submit">
              {t("saveButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
