import { describe, expect, it } from "vitest";
import { csvCell, mdEscape, toCSV, toMarkdown } from "@/lib/export";
import { signSession, verifySession } from "@/lib/security";

describe("CSV formula neutralization", () => {
  it("prefixes = + - @ with an apostrophe", () => {
    expect(csvCell("=1+1")).toBe(`"'=1+1"`);
    expect(csvCell("+5")).toBe(`"'+5"`);
    expect(csvCell("-2")).toBe(`"'-2"`);
    expect(csvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
  });
  it("leaves normal text untouched", () => {
    expect(csvCell("ok 1+1")).toBe(`"ok 1+1"`);
  });
  it("applies inside full export", () => {
    const csv = toCSV([{ id: "f", nome: "Campo", bloco: "B", ordem: 1 }], [
      { field_id: "f", nome: "Ana", texto: "=1+1", referencia: "", pulou: false, concordancia: null },
    ]);
    expect(csv).toContain(`"'=1+1"`);
  });
});

describe("Markdown escape", () => {
  it("escapes special characters", () => {
    expect(mdEscape("*a* _b_ [c] #d")).toBe("\\*a\\* \\_b\\_ \\[c\\] \\#d");
  });
});

describe("session token scope", () => {
  it("carries participant, form and version, and rejects a payload swapped to another participant", async () => {
    const t = await signSession({ pid: "A", fid: "F", v: 0, exp: Date.now() + 1000 }, "s");
    const p = await verifySession(t, "s");
    expect(p?.pid).toBe("A");
    expect(p?.fid).toBe("F");
    const [, sig] = t.split(".");
    const forged = btoa(JSON.stringify({ pid: "B", fid: "F", v: 0, exp: Date.now() + 1000 })).replace(/=+$/, "") + "." + sig;
    expect(await verifySession(forged, "s")).toBeNull();
  });
});

import { myToMarkdown, myToText } from "@/lib/my-export";
describe("participant own export", () => {
  const e = {
    titulo: "Oficina", nome: "Ana", rascunho: true,
    fields: [
      { id: "a", nome: "Atributos", bloco: "B1", ordem: 1, status: "definido" },
      { id: "b", nome: "Dano", bloco: "B1", ordem: 2, status: "proposta" },
    ],
    responses: [
      { field_id: "a", texto: "*forte*", referencia: "D&D", pulou: false, concordancia: "ajustar" },
      { field_id: "b", texto: "", referencia: "", pulou: true, concordancia: null },
    ],
  };
  const now = new Date("2026-10-22T15:00:00Z");
  it("marks draft, skipped and agreement", () => {
    const md = myToMarkdown(e, now);
    expect(md).toContain("Rascunho (não enviado)");
    expect(md).toContain("_(pulado)_");
    expect(md).toContain("**Concordância:** Quero ajustar");
    expect(md).toContain("\\*forte\\*");
    expect(myToText(e, now)).toContain("RASCUNHO (NÃO ENVIADO)");
  });
  it("omits draft notice once sent", () => {
    expect(myToMarkdown({ ...e, rascunho: false }, now)).not.toContain("Rascunho");
  });
});

describe("toMarkdown line breaks", () => {
  it("keeps paragraphs in responses, síntese and decisão final", () => {
    const md = toMarkdown(
      "T",
      [{ id: "f1", nome: "Campo", bloco: "1", ordem: 1 }],
      [
        { field_id: "f1", nome: "Ana", texto: "parágrafo um\n\nparágrafo dois", referencia: "", pulou: false, concordancia: null },
        { field_id: "f1", nome: "Bruno", texto: "resposta do Bruno", referencia: "", pulou: false, concordancia: null },
      ],
      [{ field_id: "f1", sintese: "linha A\nlinha B", status: "FECHADO", decisao_final: "decisão X\ndecisão Y" }],
    );
    // Ana's second paragraph stays inside her item, indented by two spaces, so the
    // list goes on with Bruno instead of breaking in two.
    const lines = md.split("\n");
    const start = lines.findIndex((l) => l.startsWith("- Ana:"));
    expect(start).toBeGreaterThan(-1);
    expect(lines[start].replace(/ +$/, "")).toBe("- Ana: parágrafo um");
    expect(lines[start + 1]).toBe("");
    expect(lines[start + 2]).toBe("  parágrafo dois");
    expect(lines[start + 3]).toBe("- Bruno: resposta do Bruno");
    expect(md).toContain("linha A  \nlinha B");
    expect(md).toContain("decisão X  \ndecisão Y");
  });
});

