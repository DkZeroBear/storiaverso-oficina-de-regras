// @ts-nocheck -- in-memory DB fake uses loose dynamic rows
import { describe, it, expect, beforeEach, vi } from "vitest";
import { signSession, hashPin, SESSION_TTL_MS } from "@/lib/security";

/* ---------- Minimal in-memory stand-in for the server database client ---------- */
type Row = Record<string, any>;
const db: Record<string, Row[]> = {};
let seq = 0;
const DEFAULTS: Record<string, Row> = {
  participants: { status: "rascunho", ultimo_campo: 0, sessao_versao: 0, reset_code_hash: "", reset_code_salt: "", reset_code_expira: null },
  responses: { texto: "", referencia: "", pulou: false, concordancia: null },
};

class Q {
  op = "select"; cols = "*"; filters: ((r: Row) => boolean)[] = []; payload: any; mode: "many" | "single" | "maybe" = "many"; conflict?: string[];
  constructor(public table: string) { db[table] ??= []; }
  select(c = "*") { if (this.op === "select") this.cols = c; else this.cols = c; return this; }
  insert(p: any) { this.op = "insert"; this.payload = p; return this; }
  update(p: any) { this.op = "update"; this.payload = p; return this; }
  upsert(p: any, o: { onConflict: string }) { this.op = "upsert"; this.payload = p; this.conflict = o.onConflict.split(","); return this; }
  eq(k: string, v: any) { this.filters.push((r) => r[k] === v); return this; }
  in(k: string, v: any[]) { this.filters.push((r) => v.includes(r[k])); return this; }
  order() { return this; }
  limit() { return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  private proj(r: Row) {
    if (this.cols === "*") return { ...r };
    return Object.fromEntries(this.cols.split(",").map((c) => c.trim()).map((c) => [c, r[c]]));
  }
  private run() {
    const t = db[this.table]!;
    let rows: Row[];
    if (this.op === "insert") {
      rows = [].concat(this.payload).map((p: Row) => ({ id: `id-${++seq}`, ...DEFAULTS[this.table], ...p }));
      t.push(...rows);
    } else if (this.op === "update") {
      rows = t.filter((r) => this.filters.every((f) => f(r)));
      rows.forEach((r) => Object.assign(r, this.payload));
    } else if (this.op === "upsert") {
      const ex = t.find((r) => this.conflict!.every((k) => r[k] === this.payload[k]));
      if (ex) { Object.assign(ex, this.payload); rows = [ex]; }
      else { rows = [{ id: `id-${++seq}`, ...DEFAULTS[this.table], ...this.payload }]; t.push(...rows); }
    } else rows = t.filter((r) => this.filters.every((f) => f(r)));
    const out = rows.map((r) => this.proj(r));
    if (this.mode === "single") return out[0] ? { data: out[0], error: null } : { data: null, error: { message: "no rows" } };
    if (this.mode === "maybe") return { data: out[0] ?? null, error: null };
    return { data: out, error: null };
  }
  then(res: (v: any) => any, rej?: (e: any) => any) { return Promise.resolve().then(() => this.run()).then(res, rej); }
}

/** Mirrors the SQL pin_attempt_gate: blocks after 5 failures in 10 min since the last success, else records a failure. */
function pinGate({ _form, _nome }: { _form: string; _nome: string }) {
  const now = Date.now();
  const recent = (db.pin_attempts ?? [])
    .filter((a) => a.form_id === _form && a.nome === _nome && now - Date.parse(a.tentado_em) < 600_000)
    .sort((a, b) => Date.parse(b.tentado_em) - Date.parse(a.tentado_em));
  const fails: number[] = [];
  for (const a of recent) { if (a.sucesso) break; fails.push(Date.parse(a.tentado_em)); }
  if (fails.length >= 5) return { data: `bloqueado até ${new Date(fails[4]! + 600_000).toISOString()}`, error: null };
  (db.pin_attempts ??= []).push({ form_id: _form, nome: _nome, sucesso: false, tentado_em: new Date().toISOString() });
  return { data: "ok", error: null };
}

/** Mirrors the SQL save_response: version, active, deadline, same-form field, upsert, clears when skipped. */
function saveResp(a: any) {
  const err = (m: string) => ({ data: null, error: { message: m } });
  const p = (db.participants ?? []).find((r) => r.id === a._pid && r.sessao_versao === a._versao);
  if (!p) return err("sessao_invalida");
  const f = (db.forms ?? []).find((r) => r.id === p.form_id);
  if (!f?.ativo) return err("formulario_indisponivel");
  if (f.prazo && Date.parse(f.prazo) < Date.now()) return err("prazo_encerrado");
  if (!(db.form_fields ?? []).some((r) => r.id === a._field && r.form_id === p.form_id)) return err("campo_invalido");
  const now = new Date().toISOString();
  const row = {
    participant_id: a._pid, field_id: a._field,
    texto: a._pulou ? "" : a._texto, referencia: a._pulou ? "" : a._referencia,
    pulou: a._pulou, concordancia: a._pulou ? null : a._concordancia, atualizado_em: now,
  };
  db.responses ??= [];
  const ex = db.responses.find((r) => r.participant_id === a._pid && r.field_id === a._field);
  if (ex) Object.assign(ex, row); else db.responses.push({ id: `id-${++seq}`, ...row });
  Object.assign(p, { atualizado_em: now, ultimo_campo: a._ultimo_campo });
  return { data: now, error: null };
}

const fakeAdmin = {
  from: (t: string) => new Q(t),
  rpc: async (n: string, args: any) =>
    n === "pin_attempt_gate" ? pinGate(args) : n === "save_response" ? saveResp(args) : { data: null, error: { message: "unknown rpc" } },
};
// pin_attempts inserts from the code need a timestamp
const origFrom = fakeAdmin.from;
fakeAdmin.from = (t: string) => {
  const q = origFrom(t);
  if (t === "pin_attempts") { const ins = q.insert.bind(q); q.insert = (p: any) => ins({ tentado_em: new Date().toISOString(), ...p }); }
  return q;
};

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: fakeAdmin }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => new Request("http://localhost/") }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (d: any) => any = (d) => d;
    const b: any = {
      inputValidator(v: any) { validate = v; return b; },
      middleware() { return b; },
      handler(h: any) { return (opts?: { data?: any }) => Promise.resolve().then(() => h({ data: validate(opts?.data) })); },
    };
    return b;
  },
}));

const SECRET = "test-secret-0123456789";
process.env["SESSION_SECRET"] = SECRET;
const fns = await import("@/lib/oficina.functions");

const FA = "11111111-1111-4111-8111-111111111111";
const FB = "22222222-2222-4222-8222-222222222222";
const FIELD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FIELD_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const future = () => new Date(Date.now() + 86_400_000).toISOString();

const tok = (pid: string, fid = FA, v = 0, exp = Date.now() + SESSION_TTL_MS) => signSession({ pid, fid, v, exp }, SECRET);
const save = (token: string, field_id = FIELD_A) =>
  fns.saveResponse({ data: { token, field_id, texto: "oi", referencia: "", pulou: false, concordancia: null, ultimo_campo: 0 } });

beforeEach(async () => {
  for (const k of Object.keys(db)) delete db[k];
  db.forms = [
    { id: FA, titulo: "Form A", ativo: true, prazo: future(), mostrar_respostas: false },
    { id: FB, titulo: "Form B", ativo: true, prazo: future(), mostrar_respostas: false },
  ];
  db.form_fields = [
    { id: FIELD_A, form_id: FA, nome: "Campo A", bloco: "1", ordem: 1, status: "propor" },
    { id: FIELD_B, form_id: FB, nome: "Campo B", bloco: "1", ordem: 1, status: "propor" },
  ];
  db.form_roster = [{ id: "r1", form_id: FA, nome: "Diogo" }, { id: "r2", form_id: FA, nome: "Lorena" }];
  db.participants = [
    { id: "pA", form_id: FA, nome: "Diogo", ...DEFAULTS.participants, pin_salt: "s", pin_hash: await hashPin("1234", "s") },
    { id: "pB", form_id: FA, nome: "Lorena", ...DEFAULTS.participants, pin_salt: "s", pin_hash: await hashPin("9999", "s") },
  ];
  db.responses = [
    { id: "x1", participant_id: "pA", field_id: FIELD_A, texto: "resposta de Diogo", referencia: "", pulou: false, concordancia: null },
    { id: "x2", participant_id: "pB", field_id: FIELD_A, texto: "resposta de Lorena", referencia: "", pulou: false, concordancia: null },
  ];
  db.pin_attempts = [];
});

const SESSION_ERR = /Sessão expirada/;

describe("tokens", () => {
  it("valid token saves", async () => {
    await expect(save(await tok("pA"))).resolves.toHaveProperty("savedAt");
  });
  it("rejects a tampered token", async () => {
    const t = await tok("pA");
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ pid: "pB", fid: FA, v: 0, exp: Date.now() + 1e6 })).toString("base64url");
    await expect(save(`${forged}.${sig}`)).rejects.toThrow(SESSION_ERR);
    await expect(save(`${body}.${sig!.slice(0, -2)}xx`)).rejects.toThrow(SESSION_ERR);
  });
  it("rejects an expired token", async () => {
    await expect(save(await tok("pA", FA, 0, Date.now() - 1000))).rejects.toThrow(SESSION_ERR);
  });
  it("rejects a token issued for another form", async () => {
    await expect(save(await tok("pA", FB))).rejects.toThrow(SESSION_ERR);
  });
  it("rejects a token with an old sessao_versao after a PIN reset", async () => {
    const t = await tok("pA", FA, 0);
    db.participants!.find((p) => p.id === "pA")!.sessao_versao = 1;
    await expect(save(t)).rejects.toThrow(SESSION_ERR);
    await expect(fns.resume({ data: { token: t } })).resolves.toBeNull();
  });
});

describe("writes", () => {
  it("refuses saving after the deadline", async () => {
    db.forms![0]!.prazo = new Date(Date.now() - 60_000).toISOString();
    await expect(save(await tok("pA"))).rejects.toThrow(/prazo/);
    await expect(fns.submitResponses({ data: { token: await tok("pA") } })).rejects.toThrow(/prazo/);
  });
  it("refuses saving into a field of another form", async () => {
    await expect(save(await tok("pA"), FIELD_B)).rejects.toThrow(/Campo inválido/);
    expect(db.responses!.some((r) => r.field_id === FIELD_B)).toBe(false);
  });
});

describe("exportMine", () => {
  it("returns only the caller's own answers", async () => {
    const r = await fns.exportMine({ data: { token: await tok("pA") } });
    expect(r.nome).toBe("Diogo");
    expect(r.responses.map((x) => x.texto)).toEqual(["resposta de Diogo"]);
    expect(JSON.stringify(r)).not.toMatch(/Lorena|pin_hash|pin_salt|sessao/);
  });
  it("still works after the deadline", async () => {
    db.forms![0]!.prazo = new Date(Date.now() - 60_000).toISOString();
    await expect(fns.exportMine({ data: { token: await tok("pA") } })).resolves.toHaveProperty("nome", "Diogo");
  });
});

describe("getGroupResponses", () => {
  it("returns nothing while the caller has not submitted", async () => {
    db.forms![0]!.mostrar_respostas = true;
    await expect(fns.getGroupResponses({ data: { token: await tok("pA") } })).resolves.toBeNull();
  });
  it("returns the group after submitting when the option is on", async () => {
    db.forms![0]!.mostrar_respostas = true;
    db.participants![0]!.status = "enviado";
    const r = await fns.getGroupResponses({ data: { token: await tok("pA") } });
    expect(r!.map((x) => x.nome).sort()).toEqual(["Diogo", "Lorena"]);
  });
  it("returns nothing after submitting when the option is off", async () => {
    db.participants![0]!.status = "enviado";
    await expect(fns.getGroupResponses({ data: { token: await tok("pA") } })).resolves.toBeNull();
  });
});

describe("PIN lockout", () => {
  it("blocks the name after 5 wrong PINs, even with the right PIN", async () => {
    const tryPin = (pin: string) => fns.identify({ data: { formId: FA, nome: "Diogo", pin } });
    for (let i = 0; i < 5; i++) await expect(tryPin("0000")).resolves.toMatchObject({ ok: false, error: "PIN incorreto." });
    const r = await tryPin("1234");
    expect(r.ok).toBe(false);
    expect((r as any).error).toMatch(/bloqueado/);
    // other names are unaffected
    await expect(fns.identify({ data: { formId: FA, nome: "Lorena", pin: "9999" } })).resolves.toMatchObject({ ok: true });
  });
  it("right PIN before 5 failures logs in", async () => {
    for (let i = 0; i < 4; i++) await fns.identify({ data: { formId: FA, nome: "Diogo", pin: "0000" } });
    await expect(fns.identify({ data: { formId: FA, nome: "Diogo", pin: "1234" } })).resolves.toMatchObject({ ok: true });
  });
});
