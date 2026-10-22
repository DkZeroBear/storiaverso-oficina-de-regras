import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Download, FileText, Loader2, Printer } from "lucide-react";
import { exportMine } from "@/lib/oficina.functions";
import { myToMarkdown, myToText, type MyExport } from "@/lib/my-export";
import { download } from "@/lib/export";
import { CONCORDANCIA_LABEL } from "@/lib/systems";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older mobile browsers / insecure contexts
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

const slugify = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "respostas";

export function MyExportMenu({ token, onPrint }: { token: string; onPrint: (e: MyExport) => void }) {
  const fetchMine = useServerFn(exportMine);
  const [data, setData] = useState<MyExport | null>(null);
  const [busy, setBusy] = useState(false);

  // Fetch when the menu opens so later clicks stay synchronous (keeps user activation on mobile).
  const onOpen = async (open: boolean) => {
    if (!open) return;
    setBusy(true);
    try {
      setData(await fetchMine({ data: { token } }));
    } catch (e) {
      setData(null);
      toast.error(e instanceof Error ? e.message : "Não foi possível exportar.");
    } finally {
      setBusy(false);
    }
  };

  const base = data ? `${slugify(data.titulo)}-${slugify(data.nome)}` : "respostas";
  const disabled = busy || !data;

  return (
    <DropdownMenu onOpenChange={onOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="print:hidden">
          <Download className="h-4 w-4" /> Baixar minhas respostas
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {busy && <p className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Preparando…</p>}
        <DropdownMenuItem disabled={disabled} onSelect={async () => {
          if (!data) return;
          (await copyText(myToMarkdown(data, new Date()))) ? toast.success("Copiado para a área de transferência.") : toast.error("Não foi possível copiar.");
        }}>
          <Copy className="h-4 w-4" /> Copiar como texto (Markdown)
        </DropdownMenuItem>
        <DropdownMenuItem disabled={disabled} onSelect={() => data && deliver(`${base}.md`, myToMarkdown(data, new Date()), "text/markdown;charset=utf-8")}>
          <Download className="h-4 w-4" /> Baixar arquivo .md
        </DropdownMenuItem>
        <DropdownMenuItem disabled={disabled} onSelect={() => data && deliver(`${base}.txt`, myToText(data, new Date()), "text/plain;charset=utf-8")}>
          <FileText className="h-4 w-4" /> Baixar arquivo .txt
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={disabled} onSelect={() => data && onPrint(data)}>
          <Printer className="h-4 w-4" /> Imprimir / salvar em PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const CONC: Record<string, string> = { concordo: "concordo", ajustar: "quero ajustar", sem_opiniao: "sem opinião" };

/** Print-only view: rendered off-screen, shown alone when printing. */
export function MyPrintView({ data, now }: { data: MyExport; now: string }) {
  const byField = new Map(data.responses.map((r) => [r.field_id, r]));
  const blocks: string[] = [];
  const sorted = [...data.fields].sort((a, b) => a.ordem - b.ordem);
  sorted.forEach((f) => { if (!blocks.includes(f.bloco)) blocks.push(f.bloco); });
  return (
    <div id="print-mine" className="print-only">
      <h1>{data.titulo}</h1>
      <p><b>Pessoa:</b> {data.nome}<br /><b>Exportado em:</b> {now}</p>
      {data.rascunho && <p><b>Rascunho (não enviado)</b></p>}
      {blocks.map((b) => (
        <section key={b}>
          <h2>Bloco {b}</h2>
          {sorted.filter((f) => f.bloco === b).map((f) => {
            const r = byField.get(f.id);
            return (
              <div key={f.id} className="print-field">
                <h3>{f.nome}</h3>
                {f.status === "definido" && <p><b>Concordância:</b> {r?.concordancia ? CONC[r.concordancia] : "—"}</p>}
                {r?.pulou ? <p><i>(pulado)</i></p> : (
                  <>
                    <p style={{ whiteSpace: "pre-wrap" }}><b>Resposta:</b> {r?.texto.trim() ? r.texto : "—"}</p>
                    {r?.referencia.trim() ? <p><b>Referência:</b> {r.referencia}</p> : null}
                  </>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
