import { describe, expect, it } from "vitest";
import { hashPin, isLocked, newSalt, signSession, verifySession, PIN_REGEX } from "@/lib/security";

describe("PIN", () => {
  it("accepts only 4 digits", () => {
    expect(PIN_REGEX.test("1234")).toBe(true);
    expect(PIN_REGEX.test("123")).toBe(false);
    expect(PIN_REGEX.test("12a4")).toBe(false);
  });
  it("hash differs from pin and is deterministic per salt", async () => {
    const s = newSalt();
    const h = await hashPin("1234", s);
    expect(h).not.toContain("1234");
    expect(await hashPin("1234", s)).toBe(h);
    expect(await hashPin("1235", s)).not.toBe(h);
  });
});

describe("lockout", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  const at = (minAgo: number, ok = false) => ({
    tentado_em: new Date(now - minAgo * 60000).toISOString(),
    sucesso: ok,
  });
  it("locks after 5 wrong PINs within 10 minutes", () => {
    expect(isLocked([at(1), at(2), at(3), at(4), at(5)], now).locked).toBe(true);
  });
  it("does not lock after 4 wrong PINs", () => {
    expect(isLocked([at(1), at(2), at(3), at(4)], now).locked).toBe(false);
  });
  it("ignores failures older than 10 minutes", () => {
    expect(isLocked([at(1), at(2), at(3), at(4), at(11)], now).locked).toBe(false);
  });
});

describe("session token", () => {
  it("round-trips and rejects tampering and expiry", async () => {
    const t = await signSession({ pid: "p", fid: "f", exp: Date.now() + 1000 }, "secret");
    expect((await verifySession(t, "secret"))?.pid).toBe("p");
    expect(await verifySession(t, "other")).toBeNull();
    const old = await signSession({ pid: "p", fid: "f", exp: Date.now() - 1 }, "secret");
    expect(await verifySession(old, "secret")).toBeNull();
  });
});
