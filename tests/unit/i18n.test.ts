import { describe, expect, it } from "vitest";
import da from "../../src/messages/da.json";
import en from "../../src/messages/en.json";
import it_ from "../../src/messages/it.json";

function flatten(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v !== null && typeof v === "object"
      ? flatten(v as object, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

describe("i18n completeness (§18: da/en gate, it may lag)", () => {
  it("da and en have identical key sets", () => {
    expect(flatten(en).sort()).toEqual(flatten(da).sort());
  });

  it("it has no keys outside da", () => {
    const daKeys = new Set(flatten(da));
    const orphans = flatten(it_).filter((k) => !daKeys.has(k));
    expect(orphans).toEqual([]);
  });

  it("no empty strings in da or en", () => {
    const check = (obj: object, locale: string) => {
      for (const [k, v] of Object.entries(obj)) {
        if (v !== null && typeof v === "object") check(v as object, locale);
        else expect(v, `${locale}:${k}`).not.toBe("");
      }
    };
    check(da, "da");
    check(en, "en");
  });
});
