// Pure, runtime-agnostic security helpers (Web Crypto only — works on edge workers).

const enc = new TextEncoder();

function toB64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const PIN_REGEX = /^\d{4}$/;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_WINDOW_MS = 10 * 60 * 1000;
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function newSalt(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100_000, hash: "SHA-256" },
    key,
    256,
  );
  return toHex(new Uint8Array(bits));
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Locked when there are >= 5 failed attempts within the last 10 minutes since the last success. */
export function isLocked(
  attempts: { tentado_em: string; sucesso: boolean }[],
  now: number = Date.now(),
): { locked: boolean; until?: number } {
  const recent = attempts
    .map((a) => ({ t: new Date(a.tentado_em).getTime(), ok: a.sucesso }))
    .filter((a) => now - a.t < LOCK_WINDOW_MS)
    .sort((a, b) => b.t - a.t);
  const failures: number[] = [];
  for (const a of recent) {
    if (a.ok) break;
    failures.push(a.t);
  }
  if (failures.length >= MAX_FAILED_ATTEMPTS) {
    return { locked: true, until: (failures[MAX_FAILED_ATTEMPTS - 1] ?? now) + LOCK_WINDOW_MS };
  }
  return { locked: false };
}

export type SessionPayload = { pid: string; fid: string; v?: number; exp: number };

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signSession(p: SessionPayload, secret: string): Promise<string> {
  const body = toB64url(enc.encode(JSON.stringify(p)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  return `${body}.${toB64url(new Uint8Array(sig))}`;
}

export async function verifySession(
  token: string,
  secret: string,
  now: number = Date.now(),
): Promise<SessionPayload | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      fromB64url(sig) as Uint8Array<ArrayBuffer>,
      enc.encode(body),
    );
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionPayload;
    if (typeof p.exp !== "number" || p.exp < now) return null;
    return p;
  } catch {
    return null;
  }
}
