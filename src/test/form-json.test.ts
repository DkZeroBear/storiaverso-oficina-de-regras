import { describe, expect, it } from "vitest";
import { formJsonSchema } from "@/lib/form-json";

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