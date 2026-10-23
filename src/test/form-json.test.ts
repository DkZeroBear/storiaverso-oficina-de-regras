import { describe, expect, it } from "vitest";
import { formJsonSchema } from "@/lib/form-json";
import sample from "@/data/oficina-de-regras.json";
import { hasComparativo } from "@/lib/systems";

const form = {
  slug: "teste-nomes", titulo: "Teste",
  campos: [{ bloco: "Ficha", chave: "nome", nome: "Nome", status: "propor" }],
};

describe("optional form names", () => {
  it("defaults omitted names to an empty list", () => {
    expect(formJsonSchema.parse(form).nomes).toEqual([]);
  });
  it("accepts 50 names and rejects 51", () => {
    const nomes = Array.from({ length: 50 }, (_, i) => `Pessoa ${i}`);
    expect(formJsonSchema.parse({ ...form, nomes }).nomes).toHaveLength(50);
    expect(formJsonSchema.safeParse({ ...form, nomes: [...nomes, "Pessoa 50"] }).success).toBe(false);
  });
});

describe("oficina model", () => {
  it("validates the model with 19 fields across five blocks", () => {
    const parsed = formJsonSchema.parse(sample);
    expect(parsed.campos).toHaveLength(19);
    expect(new Set(parsed.campos.map((campo) => campo.bloco)).size).toBe(5);
    expect(parsed.campos.slice(-2).map((campo) => campo.chave)).toEqual(["ficha", "lacunas"]);
  });

  it("marks ficha as essential and lacunas as optional", () => {
    const parsed = formJsonSchema.parse(sample);
    expect(parsed.campos.find((campo) => campo.chave === "ficha")?.essencial).toBe(true);
    expect(parsed.campos.find((campo) => campo.chave === "lacunas")?.essencial).toBe(false);
  });

  it("keeps ficha in comparisons and excludes lacunas", () => {
    const parsed = formJsonSchema.parse(sample);
    const keys = parsed.campos.filter((campo) => hasComparativo(campo.comparativo)).map((campo) => campo.chave);
    expect(keys).toContain("ficha");
    expect(keys).not.toContain("lacunas");
  });

  it("requires at least one comparison with nonblank text", () => {
    expect(hasComparativo({})).toBe(false);
    expect(hasComparativo({ dnd: "", ordem: "  \n " })).toBe(false);
    expect(hasComparativo(null)).toBe(false);
    expect(hasComparativo({ dnd: "", ordem: "d20" })).toBe(true);
  });
});