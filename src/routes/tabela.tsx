import { createFileRoute, notFound } from "@tanstack/react-router";
import { getLatestPublicForm } from "@/lib/oficina.functions";
import { SYSTEMS, fieldIcon } from "@/lib/systems";

export const Route = createFileRoute("/tabela")({
  head: () => ({
    meta: [
      { title: "Tabela comparativa · STORIAverso" },
      { name: "description", content: "Como D&D 5e, Ordem Paranormal, Fábula Ultima, 3DeT Victory e SWADE tratam cada mecânica." },
      { property: "og:title", content: "Tabela comparativa de mecânicas · STORIAverso" },
      { property: "og:description", content: "Comparativo de 5 sistemas de RPG, mecânica por mecânica." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async () => {
    const form = await getLatestPublicForm();
    if (!form) throw notFound();
    return form;
  },
  component: Tabela,
});

function Tabela() {
  const form = Route.useLoaderData();
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <p className="terminal-label">STORIAverso · {form.titulo}</p>
      <h1 className="mt-2 text-3xl">Tabela comparativa</h1>
      <p className="mt-2 text-muted-foreground">Como cinco sistemas resolvem cada mecânica.</p>
      <div className="mt-8 space-y-3">
        {form.fields.map((f) => {
          const Icon = fieldIcon(f.chave);
          const c = (f.comparativo ?? {}) as Record<string, string>;
          return (
            <section key={f.id} className="rounded-xl border bg-card p-4">
              <h2 className="flex items-center gap-2 text-lg">
                <Icon className="h-4 w-4 text-primary" aria-hidden /> {f.nome}
              </h2>
              <dl className="mt-3 grid gap-2 sm:grid-cols-5">
                {SYSTEMS.map((s) => (
                  <div key={s.key} className="rounded-md bg-muted p-2">
                    <dt className="terminal-label">{s.label}</dt>
                    <dd className="mt-1 text-sm">{c[s.key] ?? "—"}</dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>
    </main>
  );
}
