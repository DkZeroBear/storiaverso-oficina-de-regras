import { CONCORDANCIA_LABEL } from "@/lib/systems";

export type ExpField = { id: string; nome: string; bloco: string; ordem: number };
export type ExpResp = {
  field_id: string; nome: string; texto: string; referencia: string; pulou: boolean; concordancia: string | null;
};
export type ExpNote = { field_id: string; sintese: string; status: string; decisao_final: string };

/** Neutralizes spreadsheet formulas (=, +, -, @) and quotes the cell. */
export const csvCell = (v: string) => {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Escapes Markdown special characters so pasted text renders literally. */
export const mdEscape = (v: string) => v.replace(/\r?\n+/g, " ").replace(/([\\`*_\[\]#|<>~])/g, "\\$1").replace(/^([-+]|\d+\.)(\s)/, "\\$1$2");

/** Multi-line escape: keeps line breaks, escapes Markdown specials per line. */
export const mdBlock = (v: string) => v.split(/\r?\n/).map((l) => mdEscape(l)).join("  \n");

export function toCSV(fields: ExpField[], rs: ExpResp[]): string {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const head = ["bloco", "campo", "pessoa", "resposta", "referencia", "pulou", "concordancia"];
  const rows = rs
    .filter((r) => byId.has(r.field_id))
    .sort((a, b) => byId.get(a.field_id)!.ordem - byId.get(b.field_id)!.ordem || a.nome.localeCompare(b.nome))
    .map((r) => {
      const f = byId.get(r.field_id)!;
      return [f.bloco, f.nome, r.nome, r.texto, r.referencia, r.pulou ? "sim" : "não", r.concordancia ?? ""].map(csvCell).join(",");
    });
  return "﻿" + [head.join(","), ...rows].join("\n");
}

export function toMarkdown(titulo: string, fields: ExpField[], rs: ExpResp[], notes: ExpNote[]): string {
  const out = [`# ${mdEscape(titulo)}`, ""];
  for (const f of [...fields].sort((a, b) => a.ordem - b.ordem)) {
    const n = notes.find((x) => x.field_id === f.id);
    out.push(`## ${mdEscape(f.nome)}`, "", `**Status:** ${mdEscape(n?.status ?? "EM ABERTO")}`, "", `**Síntese:** ${n?.sintese ? mdBlock(n.sintese) : "—"}`, "");
    if (n?.decisao_final) out.push(`**Decisão final:** ${mdBlock(n.decisao_final)}`, "");
    for (const r of rs.filter((x) => x.field_id === f.id).sort((a, b) => a.nome.localeCompare(b.nome))) {
      const txt = r.pulou ? "_(pulou)_" : [r.concordancia ? `[${CONCORDANCIA_LABEL[r.concordancia]}]` : "", mdBlock(r.texto)].filter(Boolean).join(" ") || "—";
      out.push(`- ${mdEscape(r.nome)}: ${txt}${r.referencia ? ` (ref.: ${mdEscape(r.referencia)})` : ""}`);
    }
    out.push("");
  }
  return out.join("\n");
}

export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
