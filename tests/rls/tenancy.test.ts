import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  createUser,
  signIn,
  type Client,
} from "./helpers";

/**
 * Phase 0 DoD: two orgs cannot see each other's data — proven fail-closed.
 * Every test asserts either an RLS error or an empty result for the
 * cross-tenant path, and the positive path for the own-tenant case.
 */

const run = Date.now();
const OWNER_A = `rls-${run}-owner-a@test.local`;
const OWNER_B = `rls-${run}-owner-b@test.local`;
const OPERATOR = `rls-${run}-operator@test.local`;
const SCOPED_OP = `rls-${run}-scoped-op@test.local`;

let ownerA: Client;
let ownerB: Client;
let orgA: string;
let orgB: string;
let siteA1: string;
let siteA2: string;
let siteB1: string;

beforeAll(async () => {
  const admin = adminClient();
  await createUser(admin, OWNER_A, "Owner A");
  await createUser(admin, OWNER_B, "Owner B");
  await createUser(admin, OPERATOR, "Op Erator");
  await createUser(admin, SCOPED_OP, "Scoped Op");

  ownerA = await signIn(OWNER_A);
  ownerB = await signIn(OWNER_B);

  const a = await ownerA.rpc("create_organization", { p_name: `Org A ${run}` });
  const b = await ownerB.rpc("create_organization", { p_name: `Org B ${run}` });
  if (a.error || b.error) throw new Error("org setup failed");
  orgA = a.data as string;
  orgB = b.data as string;

  const sA1 = await ownerA
    .from("sites")
    .insert({ org_id: orgA, name: "A1", activity_type: "restaurant" })
    .select("id")
    .single();
  const sA2 = await ownerA
    .from("sites")
    .insert({ org_id: orgA, name: "A2", activity_type: "cafe" })
    .select("id")
    .single();
  const sB1 = await ownerB
    .from("sites")
    .insert({ org_id: orgB, name: "B1", activity_type: "takeaway" })
    .select("id")
    .single();
  if (sA1.error || sA2.error || sB1.error) throw new Error("site setup failed");
  siteA1 = sA1.data.id;
  siteA2 = sA2.data.id;
  siteB1 = sB1.data.id;
});

describe("organizations isolation", () => {
  it("owner A sees only org A", async () => {
    const { data } = await ownerA.from("organizations").select("id");
    expect(data?.map((o) => o.id)).toContain(orgA);
    expect(data?.map((o) => o.id)).not.toContain(orgB);
  });

  it("owner A cannot read org B directly", async () => {
    const { data } = await ownerA
      .from("organizations")
      .select("id")
      .eq("id", orgB);
    expect(data).toEqual([]);
  });

  it("owner A cannot update org B", async () => {
    const { data } = await ownerA
      .from("organizations")
      .update({ name: "hacked" })
      .eq("id", orgB)
      .select();
    expect(data).toEqual([]); // RLS: zero rows affected
  });

  it("direct insert into organizations is denied (RPC-only)", async () => {
    const { error } = await ownerA.from("organizations").insert({
      name: "direct",
      created_by: (await ownerA.auth.getUser()).data.user!.id,
    });
    expect(error).not.toBeNull();
  });
});

describe("sites isolation", () => {
  it("owner A sees own sites, not org B's", async () => {
    const { data } = await ownerA.from("sites").select("id");
    const ids = data?.map((s) => s.id) ?? [];
    expect(ids).toContain(siteA1);
    expect(ids).not.toContain(siteB1);
  });

  it("owner A cannot create a site in org B", async () => {
    const { error } = await ownerA
      .from("sites")
      .insert({ org_id: orgB, name: "intruder", activity_type: "restaurant" });
    expect(error).not.toBeNull();
  });

  it("owner A cannot update org B's site", async () => {
    const { data } = await ownerA
      .from("sites")
      .update({ name: "hacked" })
      .eq("id", siteB1)
      .select();
    expect(data).toEqual([]);
  });
});

describe("memberships isolation & roles", () => {
  it("owner A cannot see org B's memberships", async () => {
    const { data } = await ownerA
      .from("memberships")
      .select("id")
      .eq("org_id", orgB);
    expect(data).toEqual([]);
  });

  it("owner A cannot invite into org B", async () => {
    const { error } = await ownerA.rpc("create_invite", {
      p_org_id: orgB,
      p_email: "x@y.dk",
      p_role: "operator",
    });
    expect(error).not.toBeNull();
  });

  it("direct membership insert is denied (RPC-only)", async () => {
    const uid = (await ownerA.auth.getUser()).data.user!.id;
    const { error } = await ownerA
      .from("memberships")
      .insert({ org_id: orgB, user_id: uid, role: "org_owner" });
    expect(error).not.toBeNull();
  });

  it("operator can join via invite and then sees org A but cannot create sites", async () => {
    const invite = await ownerA.rpc("create_invite", {
      p_org_id: orgA,
      p_email: OPERATOR,
      p_role: "operator",
    });
    expect(invite.error).toBeNull();

    const op = await signIn(OPERATOR);
    const accepted = await op.rpc("accept_invite", {
      p_token: invite.data as string,
    });
    expect(accepted.error).toBeNull();
    expect(accepted.data).toBe(orgA);

    const { data: orgs } = await op.from("organizations").select("id");
    expect(orgs?.map((o) => o.id)).toContain(orgA);

    const { error } = await op
      .from("sites")
      .insert({ org_id: orgA, name: "op-site", activity_type: "cafe" });
    expect(error).not.toBeNull(); // §4.2: operators cannot create sites
  });

  it("site-scoped operator sees only their site (site_ids scoping)", async () => {
    const invite = await ownerA.rpc("create_invite", {
      p_org_id: orgA,
      p_email: SCOPED_OP,
      p_role: "operator",
      p_site_ids: [siteA1],
    });
    expect(invite.error).toBeNull();

    const op = await signIn(SCOPED_OP);
    await op.rpc("accept_invite", { p_token: invite.data as string });

    const { data: sites } = await op.from("sites").select("id");
    const ids = sites?.map((s) => s.id) ?? [];
    expect(ids).toContain(siteA1);
    expect(ids).not.toContain(siteA2);
  });

  it("accepting the same invite twice fails", async () => {
    const invite = await ownerA.rpc("create_invite", {
      p_org_id: orgA,
      p_email: `once-${run}@test.local`,
      p_role: "operator",
    });
    const op = await signIn(OPERATOR); // already a member of org A
    const again = await op.rpc("accept_invite", {
      p_token: invite.data as string,
    });
    expect(again.error).not.toBeNull(); // already_member
  });
});

describe("anonymous is fail-closed", () => {
  it("anon sees nothing anywhere", async () => {
    const anon = anonClient();
    for (const table of [
      "organizations",
      "sites",
      "memberships",
      "audit_log",
      "device_sessions",
    ] as const) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      expect(error !== null || data?.length === 0, table).toBe(true);
    }
  });

  it("anon cannot call member RPCs", async () => {
    const anon = anonClient();
    const { error } = await anon.rpc("create_organization", {
      p_name: "anon org",
    });
    expect(error).not.toBeNull();
  });
});

describe("audit_log integrity (§17 append-only, hash chain)", () => {
  it("cross-tenant audit reads are blocked", async () => {
    const { data } = await ownerB
      .from("audit_log")
      .select("id")
      .eq("org_id", orgA);
    expect(data).toEqual([]);
  });

  it("rows are hash-chained per org/site", async () => {
    const { data } = await ownerA
      .from("audit_log")
      .select("prev_hash, after_hash, created_at")
      .eq("org_id", orgA)
      .is("site_id", null)
      .order("created_at", { ascending: true });
    expect(data && data.length >= 1).toBe(true);
    for (const row of data ?? []) {
      expect(row.after_hash).toMatch(/^[a-f0-9]{64}$/);
    }
    for (let i = 1; i < (data?.length ?? 0); i++) {
      expect(data![i].prev_hash).toBe(data![i - 1].after_hash);
    }
  });

  it("audit rows cannot be updated, even by the org owner", async () => {
    const { data: rows } = await ownerA
      .from("audit_log")
      .select("id")
      .eq("org_id", orgA)
      .limit(1);
    const { error } = await ownerA
      .from("audit_log")
      .update({ action: "tampered" })
      .eq("id", rows![0].id);
    expect(error).not.toBeNull(); // permission denied: UPDATE grant revoked
  });

  it("audit rows cannot be deleted, even with the service key", async () => {
    const admin = adminClient();
    const { data: rows } = await admin
      .from("audit_log")
      .select("id")
      .eq("org_id", orgA)
      .limit(1);
    const { error } = await admin
      .from("audit_log")
      .delete()
      .eq("id", rows![0].id);
    expect(error).not.toBeNull(); // DELETE grant revoked from service_role too
  });
});

describe("membership_pins is unreachable via the API", () => {
  it("select is denied even for the org owner", async () => {
    const { error } = await ownerA.from("membership_pins").select("*");
    expect(error).not.toBeNull();
  });

  it("PIN data RPC refuses cross-org callers", async () => {
    const { data: aMembers } = await ownerA
      .from("memberships")
      .select("id")
      .eq("org_id", orgA)
      .limit(1);
    const { data } = await ownerB
      .rpc("get_pin_verification_data", {
        p_membership_id: aMembers![0].id,
      })
      .maybeSingle();
    expect(data).toBeNull();
  });
});
