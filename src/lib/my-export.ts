import { mdBlock, mdEscape } from "@/lib/export";
import { CONCORDANCIA_LABEL } from "@/lib/systems";

export type MyExportField = { id: string; nome: string; bloco: string; ordem: number; status: string };
export type MyExportResp = {
  field_id: string; texto: string; referencia: string; pulou: boolean; concordancia: string | null;
};
export type MyExport = {
  titulo: string;
  nome: string;
  rascunho: boolean;
  fields: MyExportField[];
  responses: MyExportResp[];
};

export const formatNow = (d: Date) =>
  d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) + " (Brasília)";

/** Multi-line escape: keeps line breaks, escapes Markdown specials per line. */
const mdBlock = (v: string) => v.split(/\r?\n/).map((l) => mdEscape(l)).join("  \n");

function grouped(e: MyExport) {
  const byField = new Map(e.responses.map((r) => [r.field_id, r]));
  const blocks: { nome: string; items: { f: MyExportField; r: MyExportResp | undefined }[] }[] = [];
  for (const f of [...e.fields].sort((a, b) => a.ordem - b.ordem)) {
    let b = blocks.find((x) => x.nome === f.bloco);
    if (!b) blocks.push((b = { nome: f.bloco, items: [] }));
    b.items.push({ f, r: byField.get(f.id) });
  }
  return blocks;
}

export function myToMarkdown(e: MyExport, now: Date): string {
  const out = [`# ${mdEscape(e.titulo)}`, "", `**Pessoa:** ${mdEscape(e.nome)}  `, `**Exportado em:** ${formatNow(now)}`];
  if (e.rascunho) out.push("", "> **Rascunho (não enviado)**");
  out.push("");
  for (const b of grouped(e)) {
    out.push(`## Bloco ${mdEscape(b.nome)}`, "");
    for (const { f, r } of b.items) {
      out.push(`### ${mdEscape(f.nome)}`, "");
      if (f.status === "definido") out.push(`**Concordância:** ${r?.concordancia ? CONC[r.concordancia] : "—"}`, "");
      if (r?.pulou) out.push("_(pulado)_", "");
      else {
        out.push(`**Resposta:** ${r?.texto.trim() ? mdBlock(r.texto) : "—"}`, "");
        if (r?.referencia.trim()) out.push(`**Referência:** ${mdEscape(r.referencia)}`, "");
      }
    }
  }
  return out.join("\n");
}

export function myToText(e: MyExport, now: Date): string {
  const out = [e.titulo, "=".repeat(Math.min(60, e.titulo.length)), `Pessoa: ${e.nome}`, `Exportado em: ${formatNow(now)}`];
  if (e.rascunho) out.push("RASCUNHO (NÃO ENVIADO)");
  out.push("");
  for (const b of grouped(e)) {
    out.push(`--- Bloco ${b.nome} ---`, "");
    for (const { f, r } of b.items) {
      out.push(f.nome);
      if (f.status === "definido") out.push(`  Concordância: ${r?.concordancia ? CONC[r.concordancia] : "—"}`);
      if (r?.pulou) out.push("  (pulado)");
      else {
        out.push(`  Resposta: ${r?.texto.trim() ? r.texto.replace(/\r?\n/g, "\n  ") : "—"}`);
        if (r?.referencia.trim()) out.push(`  Referência: ${r.referencia}`);
      }
      out.push("");
    }
  }
  return out.join("\n");
}
