"use client";

import { createClient } from "@/lib/supabase/browser";
import { offlineDb, type OutboxEntry } from "./db";
import {
  syncAdHocRecord,
  syncCompleteTask,
  type SyncResult,
} from "@/app/(operator)/app/[site]/check/_actions";

/**
 * Outbox engine (§16): enqueue locally, drain through idempotent server
 * actions (clientUuid). Photos upload FIRST (storage path carries the
 * clientUuid so re-uploads overwrite deterministically), then the record.
 */

export async function enqueue(
  entry: Omit<OutboxEntry, "id" | "attempts" | "enqueuedAt">,
): Promise<number> {
  const id = await offlineDb.outbox.add({
    ...entry,
    attempts: 0,
    enqueuedAt: Date.now(),
  });
  // ask the browser to wake us when connectivity returns (§16). navigator
  // .serviceWorker.ready never resolves without a registered SW (e.g. dev), so
  // only touch it when a worker actually controls the page.
  if (navigator.serviceWorker?.controller) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await (registration as ServiceWorkerRegistration & {
        sync?: { register: (tag: string) => Promise<void> };
      }).sync?.register("kp-outbox");
    } catch {
      // Background Sync unsupported — the foreground interval covers it
    }
  }
  return id as number;
}

export async function attachDeviationSteps(
  outboxId: number,
  steps: NonNullable<OutboxEntry["payload"]["deviationSteps"]>,
): Promise<void> {
  const entry = await offlineDb.outbox.get(outboxId);
  if (!entry) return;
  await offlineDb.outbox.update(outboxId, {
    payload: { ...entry.payload, deviationSteps: steps },
  });
}

export async function pendingCount(): Promise<number> {
  return offlineDb.outbox.count();
}

async function uploadPhotos(entry: OutboxEntry): Promise<string[]> {
  if (entry.photos.length === 0) return [];
  const supabase = createClient();
  const paths: string[] = [];
  for (let i = 0; i < entry.photos.length; i++) {
    const photo = entry.photos[i]!;
    const ext = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
    const path = `${entry.siteId}/records/${entry.clientUuid}-${i}.${ext}`;
    const { error } = await supabase.storage
      .from("photos")
      .upload(path, photo.blob, { contentType: photo.type, upsert: true });
    if (error) throw new Error(`photo upload: ${error.message}`);
    paths.push(path);
  }
  return paths;
}

let flushing = false;

/** Drains the outbox. Returns how many entries remain. */
export async function flush(): Promise<number> {
  if (flushing) return pendingCount();
  flushing = true;
  try {
    const entries = await offlineDb.outbox.orderBy("enqueuedAt").toArray();
    for (const entry of entries) {
      try {
        const photoPaths = await uploadPhotos(entry);
        let result: SyncResult;
        if (entry.kind === "completion") {
          result = await syncCompleteTask({
            siteId: entry.siteId,
            taskId: entry.payload.taskId!,
            value: entry.payload.value!,
            note: entry.payload.note,
            clientUuid: entry.clientUuid,
            clientCreatedAt: entry.clientCreatedAt,
            photoPaths,
            deviationSteps: entry.payload.deviationSteps,
          });
        } else {
          result = await syncAdHocRecord({
            siteId: entry.siteId,
            kind: entry.payload.adHocKind!,
            equipmentId: entry.payload.equipmentId,
            tempC: entry.payload.tempC,
            text: entry.payload.text,
            clientUuid: entry.clientUuid,
            clientCreatedAt: entry.clientCreatedAt,
          });
        }
        if ("ok" in result || result.error === "drop") {
          await offlineDb.outbox.delete(entry.id!);
        } else {
          await offlineDb.outbox.update(entry.id!, {
            attempts: entry.attempts + 1,
            lastError: result.error,
          });
        }
      } catch (err) {
        // network/transient failure: keep the entry, note the error
        await offlineDb.outbox.update(entry.id!, {
          attempts: entry.attempts + 1,
          lastError: err instanceof Error ? err.message : "network",
        });
      }
    }
    return pendingCount();
  } finally {
    flushing = false;
  }
}
