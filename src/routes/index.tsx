import { createFileRoute, redirect } from "@tanstack/react-router";
import { getLatestSlug } from "@/lib/oficina.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "STORIAverso · Oficinas" },
      { name: "description", content: "Acesse a oficina ativa do STORIAverso e contribua com ideias para as regras do jogo." },
      { property: "og:title", content: "STORIAverso · Oficinas" },
      { property: "og:description", content: "Acesse a oficina ativa do STORIAverso." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async () => {
    const slug = await getLatestSlug();
    if (slug) throw redirect({ to: "/f/$slug", params: { slug } });
    return null;
  },
  component: () => (
    <main className="flex min-h-screen items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-3xl">STORIAverso · Oficinas</h1>
        <p className="mt-3 text-muted-foreground">Nenhuma oficina ativa no momento.</p>
      </div>
    </main>
  ),
});
