import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import {
  PIN_REGEX,
  SESSION_TTL_MS,
  hashPin,
  newSalt,
  safeEqual,
  signSession,
  verifySession,
} from "@/lib/security";

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function secret() {
  const s = process.env["SESSION_SECRET"];
  if (!s) throw new Error("SESSION_SECRET ausente");
  return s;
}

export type PublicField = Database["public"]["Tables"]["form_fields"]["Row"];
export type PublicForm = {
  id: string;
  slug: string;
  titulo: string;
  introducao: string;
  prazo: string | null;
  mostrar_respostas: boolean;
  fields: PublicField[];
  roster: string[];
};

/* ---------- Public reads ---------- */

export const getRequestOrigin = createServerFn({ method: "GET" }).handler(() => {
  const req = getRequest();
  const url = new URL(req.url);
  const sandboxHost = url.hostname === "localhost" ? req.headers.get("x-forwarded-host") : null;
  return sandboxHost ? `https://${sandboxHost}` : url.origin;
});

export const getLatestSlug = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await publicClient()
    .from("forms")
    .select("slug")
    .eq("ativo", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.slug ?? null;
});

export const getPublicForm = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => z.object({ slug: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }): Promise<PublicForm | null> => {
    const sb = publicClient();
    const { data: form } = await sb
      .from("forms")
      .select("id,slug,titulo,introducao,prazo,mostrar_respostas")
      .eq("slug", data.slug)
      .eq("ativo", true)
      .maybeSingle();
    if (!form) return null;
    const [{ data: fields }, { data: roster }] = await Promise.all([
      sb.from("form_fields").select("*").eq("form_id", form.id).order("ordem"),
      sb.from("form_roster").select("nome").eq("form_id", form.id).order("nome"),
    ]);
    return { ...form, fields: fields ?? [], roster: (roster ?? []).map((r) => r.nome) };
  });

/* ---------- Participant identity ---------- */

export const checkName = createServerFn({ method: "POST" })
  .inputValidator((d: { formId: string; nome: string }) =>
    z.object({ formId: z.string().uuid(), nome: z.string().trim().min(1).max(100) }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin();
    const { data: p } = await sb
      .from("participants")
      .select("pin_hash")
      .eq("form_id", data.formId)
      .eq("nome", data.nome)
      .maybeSingle();
    // exists = has a PIN set; reset = PIN was reset and needs the facilitator's one-time code
    return { exists: !!p && p.pin_hash !== "", reset: !!p && p.pin_hash === "" };
  });

export type MyResponse = {
  field_id: string;
  texto: string;
  referencia: string;
  pulou: boolean;
  concordancia: "concordo" | "ajustar" | "sem_opiniao" | null;
};
export type MyState = {
  token: string;
  nome: string;
  status: "rascunho" | "enviado";
  ultimo_campo: number;
  responses: MyResponse[];
};

async function loadState(pid: string, token: string): Promise<MyState> {
  const sb = await admin();
  const { data: p } = await sb
    .from("participants")
    .select("nome,status,ultimo_campo")
    .eq("id", pid)
    .single();
  const { data: rs } = await sb
    .from("responses")
    .select("field_id,texto,referencia,pulou,concordancia")
    .eq("participant_id", pid);
  return {
    token,
    nome: p!.nome,
    status: p!.status as MyState["status"],
    ultimo_campo: p!.ultimo_campo,
    responses: (rs ?? []) as MyResponse[],
  };
}

export const identify = createServerFn({ method: "POST" })
  .inputValidator((d: { formId: string; nome: string; pin: string; codigo?: string }) =>
    z
      .object({
        formId: z.string().uuid(),
        nome: z.string().trim().min(1).max(100),
        pin: z.string().regex(PIN_REGEX, "PIN deve ter 4 dígitos"),
        codigo: z.string().trim().toUpperCase().max(12).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true; state: MyState } | { ok: false; error: string; needCode?: boolean }> => {
    const sb = await admin();
    const { data: form } = await sb.from("forms").select("id,ativo").eq("id", data.formId).maybeSingle();
    if (!form?.ativo) return { ok: false, error: "Formulário indisponível." };
    const { data: inRoster } = await sb
      .from("form_roster")
      .select("id")
      .eq("form_id", data.formId)
      .eq("nome", data.nome)
      .maybeSingle();
    if (!inRoster) return { ok: false, error: "Nome não está na lista." };

    const { data: p } = await sb
      .from("participants")
      .select("id,pin_hash,pin_salt,sessao_versao,reset_code_hash,reset_code_salt,reset_code_expira")
      .eq("form_id", data.formId)
      .eq("nome", data.nome)
      .maybeSingle();

    const now = new Date().toISOString();
    if (!p) {
      const salt = newSalt();
      const { data: created, error } = await sb
        .from("participants")
        .insert({ form_id: data.formId, nome: data.nome, pin_salt: salt, pin_hash: await hashPin(data.pin, salt), pin_criado_em: now })
        .select("id")
        .single();
      if (error || !created) return { ok: false, error: "Não foi possível criar o acesso." };
      const token = await signSession({ pid: created.id, fid: data.formId, v: 0, exp: Date.now() + SESSION_TTL_MS }, secret());
      return { ok: true, state: await loadState(created.id, token) };
    }

    // Atomic rate limit: records a failure up front, serialized per form+name
    const { data: gate, error: gateErr } = await sb.rpc("pin_attempt_gate", { _form: data.formId, _nome: data.nome });
    if (gateErr || !gate) return { ok: false, error: "Não foi possível entrar. Tente de novo." };
    if (gate.startsWith("bloqueado")) {
      const until = Date.parse(gate.replace("bloqueado até ", ""));
      return { ok: false, error: lockMessage(Math.max(1, Math.ceil((until - Date.now()) / 60000))) };
    }
    const markOk = () => sb.from("pin_attempts").insert({ form_id: data.formId, nome: data.nome, sucesso: true });

    let v = p.sessao_versao;
    if (p.pin_hash === "") {
      // PIN was reset: requires the facilitator's one-time code
      if (!data.codigo) return { ok: false, needCode: true, error: "Digite o código que o facilitador te enviou." };
      if (!p.reset_code_hash) return { ok: false, error: "Código inválido. Peça um novo ao facilitador." };
      if (!p.reset_code_expira || Date.parse(p.reset_code_expira) < Date.now())
        return { ok: false, error: "Código vencido. Peça um novo ao facilitador." };
      if (!safeEqual(await sha256Hex(p.reset_code_salt + data.codigo), p.reset_code_hash))
        return { ok: false, error: "Código incorreto." };
      const salt = newSalt();
      v = p.sessao_versao + 1;
      const { data: upd, error } = await sb
        .from("participants")
        .update({
          pin_salt: salt, pin_hash: await hashPin(data.pin, salt), pin_criado_em: now,
          reset_code_hash: "", reset_code_salt: "", reset_code_expira: null, sessao_versao: v,
        })
        .eq("id", p.id)
        .eq("reset_code_hash", p.reset_code_hash)
        .select("id");
      if (error || !upd?.length) return { ok: false, error: "Código inválido. Peça um novo ao facilitador." };
    } else if (!safeEqual(await hashPin(data.pin, p.pin_salt), p.pin_hash)) {
      return { ok: false, error: "PIN incorreto." };
    }
    await markOk();
    const token = await signSession({ pid: p.id, fid: data.formId, v, exp: Date.now() + SESSION_TTL_MS }, secret());
    return { ok: true, state: await loadState(p.id, token) };
  });

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function lockMessage(min: number) {
  return `Este nome foi bloqueado por ${min} min depois de 5 PINs errados. Tente de novo mais tarde ou peça ao facilitador para redefinir seu PIN.`;
}

const tokenSchema = z.string().min(10).max(2000);

/** Valid signature + not expired + participant still exists in that form + PIN not reset since issue. */
async function checkToken(token: string) {
  const s = await verifySession(token, secret());
  if (!s) return null;
  const sb = await admin();
  const { data: p } = await sb.from("participants").select("form_id,sessao_versao").eq("id", s.pid).maybeSingle();
  if (!p || p.form_id !== s.fid || p.sessao_versao !== (s.v ?? 0)) return null;
  return s;
}

async function auth(token: string) {
  const s = await checkToken(token);
  if (!s) throw new Error("Sessão expirada. Entre de novo com nome e PIN.");
  return s;
}

async function assertOpen(fid: string) {
  const sb = await admin();
  const { data } = await sb.from("forms").select("prazo,ativo").eq("id", fid).single();
  if (!data?.ativo) throw new Error("Formulário indisponível.");
  if (data.prazo && new Date(data.prazo).getTime() < Date.now()) throw new Error("O prazo de envio terminou.");
}

export const resume = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const s = await checkToken(data.token);
    if (!s) return null;
    return { fid: s.fid, state: await loadState(s.pid, data.token) };
  });

export const saveResponse = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        field_id: z.string().uuid(),
        texto: z.string().max(1200),
        referencia: z.string().max(200),
        pulou: z.boolean(),
        concordancia: z.enum(["concordo", "ajustar", "sem_opiniao"]).nullable(),
        ultimo_campo: z.number().int().min(0).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const s = await auth(data.token);
    await assertOpen(s.fid);
    const sb = await admin();
    const { data: f } = await sb.from("form_fields").select("form_id").eq("id", data.field_id).single();
    if (f?.form_id !== s.fid) throw new Error("Campo inválido.");
    const now = new Date().toISOString();
    const { error } = await sb.from("responses").upsert(
      {
        participant_id: s.pid,
        field_id: data.field_id,
        texto: data.pulou ? "" : data.texto,
        referencia: data.pulou ? "" : data.referencia,
        pulou: data.pulou,
        concordancia: data.concordancia,
        atualizado_em: now,
      },
      { onConflict: "participant_id,field_id" },
    );
    if (error) throw new Error("Falha ao salvar.");
    await sb.from("participants").update({ atualizado_em: now, ultimo_campo: data.ultimo_campo }).eq("id", s.pid);
    return { savedAt: now };
  });

export const saveProgress = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: tokenSchema, ultimo_campo: z.number().int().min(0).max(500) }).parse(d),
  )
  .handler(async ({ data }) => {
    const s = await auth(data.token);
    try { await assertOpen(s.fid); } catch { return { ok: false }; }
    const sb = await admin();
    await sb.from("participants").update({ ultimo_campo: data.ultimo_campo }).eq("id", s.pid);
    return { ok: true };
  });

export const submitResponses = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const s = await auth(data.token);
    await assertOpen(s.fid);
    const sb = await admin();
    const now = new Date().toISOString();
    await sb.from("participants").update({ status: "enviado", enviado_em: now, atualizado_em: now }).eq("id", s.pid);
    return { enviado_em: now };
  });

export const getGroupResponses = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const s = await auth(data.token);
    const sb = await admin();
    const [{ data: form }, { data: me }] = await Promise.all([
      sb.from("forms").select("mostrar_respostas").eq("id", s.fid).single(),
      sb.from("participants").select("status").eq("id", s.pid).single(),
    ]);
    if (!form?.mostrar_respostas || me?.status !== "enviado") return null;
    const { data: ps } = await sb.from("participants").select("id,nome").eq("form_id", s.fid);
    const ids = (ps ?? []).map((p) => p.id);
    if (!ids.length) return [];
    const { data: rs } = await sb
      .from("responses")
      .select("participant_id,field_id,texto,referencia,pulou,concordancia")
      .in("participant_id", ids);
    const names = new Map((ps ?? []).map((p) => [p.id, p.nome]));
    return (rs ?? []).map((r) => ({ ...r, nome: names.get(r.participant_id) ?? "?" }));
  });

/** The caller's own answers only (R5). Works after the deadline (no assertOpen). No PIN/hash/salt/token/notes. */
export const exportMine = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const s = await auth(data.token);
    const sb = await admin();
    const [{ data: form }, { data: fields }, { data: p }, { data: rs }] = await Promise.all([
      sb.from("forms").select("titulo").eq("id", s.fid).single(),
      sb.from("form_fields").select("id,nome,bloco,ordem,status").eq("form_id", s.fid),
      sb.from("participants").select("nome,status").eq("id", s.pid).single(),
      sb.from("responses").select("field_id,texto,referencia,pulou,concordancia").eq("participant_id", s.pid),
    ]);
    if (!form || !p) throw new Error("Não foi possível exportar.");
    return {
      titulo: form.titulo,
      nome: p.nome,
      rascunho: p.status !== "enviado",
      fields: (fields ?? []).map((f) => ({ id: f.id, nome: f.nome, bloco: f.bloco, ordem: f.ordem, status: f.status })),
      responses: (rs ?? []).map((r) => ({
        field_id: r.field_id, texto: r.texto, referencia: r.referencia, pulou: r.pulou, concordancia: r.concordancia,
      })),
    };
  });
