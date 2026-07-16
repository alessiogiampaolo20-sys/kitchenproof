"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bell, BellRing } from "lucide-react";
import { savePushSubscription } from "./_actions";
import { Button } from "@/components/ui/button";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** §8.4 push reminders opt-in for the kitchen device (needs the prod SW). */
export function PushSubscribe({ siteId }: { siteId: string }) {
  const t = useTranslations("push");
  const [state, setState] = useState<"unsupported" | "ready" | "subscribed">(
    "unsupported",
  );

  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    ) {
      return;
    }
    void navigator.serviceWorker.getRegistration().then(async (registration) => {
      if (!registration) return; // dev mode: SW disabled
      const existing = await registration.pushManager.getSubscription();
      setState(existing ? "subscribed" : "ready");
    });
  }, []);

  if (state === "unsupported") return null;
  if (state === "subscribed") {
    return <BellRing className="size-5 text-primary" aria-label={t("enabled")} />;
  }

  async function subscribe() {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        ),
      });
      const json = subscription.toJSON();
      const result = await savePushSubscription({
        siteId,
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
      });
      if ("ok" in result) {
        setState("subscribed");
        toast.success(t("enabled"));
      }
    } catch {
      // user dismissed or push service unavailable — stay opt-in-able
    }
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={subscribe}>
      <Bell /> {t("enable")}
    </Button>
  );
}
