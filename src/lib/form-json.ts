import { z } from "zod";

export const formJsonSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,80}$/, "slug: só letras minúsculas, números e hífen"),
  titulo: z.string().trim().min(1).max(200),
  introducao: z.string().max(4000).default(""),
  prazo: z.string().datetime({ offset: true }).nullable().optional(),
  nomes: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
  campos: z
    .array(
      z.object({
        bloco: z.string().trim().min(1).max(120),
        chave: z.string().trim().min(1).max(80),
        nome: z.string().trim().min(1).max(120),
        status: z.enum(["propor", "definido"]),
        o_que_e: z.string().max(2000).default(""),
        exemplo: z.string().max(2000).default(""),
        pergunta: z.string().max(2000).default(""),
        definicao_atual: z.string().max(2000).nullable().optional(),
        comparativo: z.record(z.string()).default({}),
      }),
    )
    .min(1)
    .max(200),
});
export type FormJson = z.infer<typeof formJsonSchema>;
