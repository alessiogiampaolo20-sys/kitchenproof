"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

/** §16: versioned deploys with an in-app "update ready" toast. */
export function SwUpdateToast() {
  const t = useTranslations("offline");

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // manual registration (see next.config.ts note); dev runs without a SW
    if (process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register("/sw.js");
    }

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    void navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;
      const promptIfWaiting = () => {
        if (registration.waiting) {
          toast(t("updateReady"), {
            duration: Infinity,
            action: {
              label: t("reload"),
              onClick: () => registration.waiting?.postMessage("SKIP_WAITING"),
            },
          });
        }
      };
      promptIfWaiting();
      registration.addEventListener("updatefound", () => {
        registration.installing?.addEventListener("statechange", promptIfWaiting);
      });
    });

    return () =>
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, [t]);

  return null;
}
