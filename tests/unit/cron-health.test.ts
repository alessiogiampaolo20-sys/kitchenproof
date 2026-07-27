import { describe, expect, it, vi, afterEach } from "vitest";
import { runCron, type CronReport } from "@/lib/cron/run";

/**
 * Regression cover for the five-day production blackout (docs/audit.md §3):
 * a service client that cannot read the database used to produce a cheerful
 * all-zero report with HTTP 200. These tests fail if that ever comes back.
 */

type Result = { data: unknown; error: { message: string } | null };

/** Minimal PostgREST-shaped stub: every builder method returns itself. */
function stubClient(sitesResult: Result) {
  const chain: Record<string, unknown> = {};
  const passthrough = () => chain;
  for (const method of [
    "select", "eq", "gt", "gte", "lt", "lte", "in", "is", "order", "limit",
    "insert", "update", "upsert", "maybeSingle", "single",
  ]) {
    chain[method] = passthrough;
  }
  // `await`ing the builder resolves to the query result
  chain.then = (resolve: (value: Result) => unknown) => resolve(sitesResult);

  return {
    from: (table: string) => {
      if (table === "sites") return chain;
      // any other table: an empty, successful result
      const empty: Record<string, unknown> = {};
      for (const method of [
        "select", "eq", "gt", "gte", "lt", "lte", "in", "is", "order", "limit",
        "insert", "update", "upsert", "maybeSingle", "single",
      ]) {
        empty[method] = () => empty;
      }
      empty.then = (resolve: (value: Result) => unknown) =>
        resolve({ data: [], error: null });
      return empty;
    },
  } as never;
}

afterEach(() => vi.restoreAllMocks());

describe("runCron health reporting", () => {
  it("throws when the site list cannot be read — never reports a clean no-op", async () => {
    const broken = stubClient({
      data: null,
      error: { message: "Invalid API key" },
    });

    await expect(runCron(broken)).rejects.toThrow(/Invalid API key/);
  });

  it("reports zero sites truthfully when there genuinely are none", async () => {
    const empty = stubClient({ data: [], error: null });

    const report: CronReport = await runCron(empty);

    expect(report.sitesMaterialized).toBe(0);
    expect(report.errors).toEqual([]);
  });
});

describe("createServiceClient", () => {
  const envKeys = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

  async function withEnv(
    values: Partial<Record<(typeof envKeys)[number], string>>,
    assertion: (create: () => unknown) => void,
  ) {
    const previous = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
    for (const key of envKeys) process.env[key] = values[key] ?? "";
    vi.resetModules();
    try {
      const { createServiceClient } = await import("@/lib/supabase/service");
      assertion(createServiceClient);
    } finally {
      for (const key of envKeys) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
      vi.resetModules();
    }
  }

  it("throws on a missing key instead of returning a client that fails every query", async () => {
    await withEnv({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }, (create) => {
      expect(create).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    });
  });

  it("throws on a blank key — whitespace is not a credential", async () => {
    await withEnv(
      { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SERVICE_ROLE_KEY: "   " },
      (create) => {
        expect(create).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
      },
    );
  });

  it("builds a client when both values are present", async () => {
    await withEnv(
      { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SERVICE_ROLE_KEY: "test-key" },
      (create) => {
        expect(create).not.toThrow();
      },
    );
  });
});
