import Dexie, { type EntityTable } from "dexie";
import type { CheckValue } from "@/lib/compliance/checks";

/**
 * Offline stores (§16). The outbox is the single write path when offline:
 * mutations queue locally (photos as blobs) and drain through idempotent
 * server actions keyed by clientUuid. Caches let the offline fallback page
 * render today's work after a reload without connectivity.
 */

export type OutboxDeviationSteps = {
  foodAssessment: string;
  correctiveAction: string;
  followUpHours: number;
  skipFollowUp: boolean;
};

export type OutboxEntry = {
  id?: number;
  clientUuid: string;
  siteId: string;
  kind: "completion" | "adhoc";
  payload: {
    taskId?: string;
    value?: CheckValue;
    note?: string;
    deviationSteps?: OutboxDeviationSteps;
    // adhoc
    adHocKind?: "temp" | "note";
    equipmentId?: string;
    tempC?: number;
    text?: string;
  };
  photos: { name: string; type: string; blob: Blob }[];
  clientCreatedAt: string; // device clock — §16 clock integrity
  attempts: number;
  lastError?: string;
  enqueuedAt: number;
};

export type CachedCheck = {
  taskId: string;
  siteId: string;
  dueAt: string;
  dueWindowMinutes: number;
  status: string;
  verifiesDeviation: boolean;
  cpName: string;
  category: string;
  limitJson: unknown;
  equipmentName: string | null;
  checklistItems: { key: string; label: string }[] | null;
  cachedAt: number;
};

export type MetaEntry = { key: string; value: string };

export const offlineDb = new Dexie("kitchenproof") as Dexie & {
  outbox: EntityTable<OutboxEntry, "id">;
  checksCache: EntityTable<CachedCheck, "taskId">;
  meta: EntityTable<MetaEntry, "key">;
};

offlineDb.version(1).stores({
  outbox: "++id, clientUuid, siteId, enqueuedAt",
  checksCache: "taskId, siteId, dueAt",
  meta: "key",
});
