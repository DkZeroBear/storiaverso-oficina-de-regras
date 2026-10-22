export type ExpField = { id: string; nome: string; bloco: string; ordem: number };
export type ExpResp = {
  field_id: string; nome: string; texto: string; referencia: string; pulou: boolean; concordancia: string | null;
};
export type ExpNote = { field_id: string; sintese: string; status: string; decisao_final: string };

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

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
  return "\uFEFF" + [head.join(","), ...rows].join("\n");
}

const CONC: Record<string, string> = { concordo: "Concordo", ajustar: "Quero ajustar", sem_opiniao: "Não tenho opinião" };

export function toMarkdown(titulo: string, fields: ExpField[], rs: ExpResp[], notes: ExpNote[]): string {
  const out = [`# ${titulo}`, ""];
  for (const f of [...fields].sort((a, b) => a.ordem - b.ordem)) {
    const n = notes.find((x) => x.field_id === f.id);
    out.push(`## ${f.nome}`, "", `**Status:** ${n?.status ?? "EM ABERTO"}`, "", `**Síntese:** ${n?.sintese || "—"}`, "");
    if (n?.decisao_final) out.push(`**Decisão final:** ${n.decisao_final}`, "");
    for (const r of rs.filter((x) => x.field_id === f.id).sort((a, b) => a.nome.localeCompare(b.nome))) {
      const txt = r.pulou ? "_(pulou)_" : [r.concordancia ? `[${CONC[r.concordancia]}]` : "", r.texto.replace(/\n+/g, " ")].filter(Boolean).join(" ") || "—";
      out.push(`- ${r.nome}: ${txt}${r.referencia ? ` (ref.: ${r.referencia})` : ""}`);
    }
    out.push("");
  }
  return out.join("\n");
}

export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
