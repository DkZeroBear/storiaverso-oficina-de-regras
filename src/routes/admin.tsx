import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, LogOut, Search, ShieldCheck, Loader2, Copy, Archive, Plus, Trash2, KeyRound, Pencil } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toCSV, toMarkdown, download } from "@/lib/export";
import { formJsonSchema } from "@/lib/form-json";
import sample from "@/data/oficina-de-regras.json";

type T = Database["public"]["Tables"];
type Form = T["forms"]["Row"];
type Field = T["form_fields"]["Row"];
type Participant = Pick<T["participants"]["Row"], "id" | "form_id" | "nome" | "status" | "ultimo_campo" | "enviado_em" | "atualizado_em" | "pin_criado_em">;
type Resp = T["responses"]["Row"];
type Note = T["facilitator_notes"]["Row"];

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Painel do facilitador · STORIAverso" },
      { name: "description", content: "Painel de administração das oficinas do STORIAverso." },
      { property: "og:title", content: "Painel do facilitador · STORIAverso" },
      { property: "og:description", content: "Painel de administração das oficinas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const [state, setState] = useState<"loading" | "out" | "in">("loading");

  const verify = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return setState("out");
    const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    if (!role) {
      await supabase.auth.signOut();
      toast.error("Esta conta não tem acesso de administrador.");
      return setState("out");
    }
    setState("in");
  }, []);

  useEffect(() => {
    verify();
    const { data } = supabase.auth.onAuthStateChange((e) => {
      if (e === "SIGNED_IN" || e === "SIGNED_OUT") verify();
    });
    return () => data.subscription.unsubscribe();
  }, [verify]);

  if (state === "loading") return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;
  if (state === "out") return <Login />;
  return <Dashboard />;
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <p className="terminal-label">STORIAverso · Oficinas</p>
      <h1 className="mt-1 text-3xl">Painel do facilitador</h1>
      <form className="mt-6 space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        setBusy(false);
        if (error) toast.error("E-mail ou senha incorretos.");
      }}>
        <div className="space-y-1"><Label htmlFor="em">E-mail</Label><Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="space-y-1"><Label htmlFor="pw">Senha</Label><Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        <Button type="submit" disabled={busy} className="w-full">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Entrar</Button>
      </form>
    </main>
  );
}

function Dashboard() {
  const [forms, setForms] = useState<Form[]>([]);
  const [formId, setFormId] = useState<string>("");
  const loadForms = useCallback(async () => {
    const { data } = await supabase.from("forms").select("*").order("created_at", { ascending: false });
    setForms(data ?? []);
    setFormId((cur) => cur || data?.find((f) => f.ativo)?.id || data?.[0]?.id || "");
  }, []);
  useEffect(() => { loadForms(); }, [loadForms]);
  const form = forms.find((f) => f.id === formId);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <p className="terminal-label">Painel do facilitador</p>
          <h1 className="text-3xl">STORIAverso · Oficinas</h1>
        </div>
        <select aria-label="Formulário" className="ml-auto rounded-md border bg-card px-3 py-2 text-sm" value={formId} onChange={(e) => setFormId(e.target.value)}>
          {forms.map((f) => <option key={f.id} value={f.id}>{f.titulo}{f.ativo ? "" : " (arquivado)"}</option>)}
        </select>
        <Button variant="outline" onClick={() => supabase.auth.signOut()}><LogOut className="h-4 w-4" /> Sair</Button>
      </header>
      <p className="mt-4 flex items-start gap-2 rounded-lg border bg-card p-3 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-defined" />
        As respostas são vistas só por você enquanto “Mostrar respostas do grupo” estiver desligado.
      </p>
      {form ? <FormAdmin key={form.id} form={form} onChanged={loadForms} /> : <p className="mt-8 text-muted-foreground">Nenhum formulário.</p>}
      <div className="mt-10"><FormsManager forms={forms} onChanged={loadForms} /></div>
    </main>
  );
}

function FormAdmin({ form, onChanged }: { form: Form; onChanged: () => void }) {
  const [fields, setFields] = useState<Field[]>([]);
  const [parts, setParts] = useState<Participant[]>([]);
  const [resps, setResps] = useState<Resp[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  const load = useCallback(async () => {
    const [f, p] = await Promise.all([
      supabase.from("form_fields").select("*").eq("form_id", form.id).order("ordem"),
      supabase.from("participants").select("id,form_id,nome,status,ultimo_campo,enviado_em,atualizado_em,pin_criado_em").eq("form_id", form.id).order("nome"),
    ]);
    const fs = f.data ?? []; const ps = p.data ?? [];
    setFields(fs); setParts(ps);
    const [r, n] = await Promise.all([
      ps.length ? supabase.from("responses").select("*").in("participant_id", ps.map((x) => x.id)) : Promise.resolve({ data: [] as Resp[] }),
      fs.length ? supabase.from("facilitator_notes").select("*").in("field_id", fs.map((x) => x.id)) : Promise.resolve({ data: [] as Note[] }),
    ]);
    setResps(r.data ?? []); setNotes(n.data ?? []);
  }, [form.id]);
  useEffect(() => { load(); }, [load]);

  const nameOf = useMemo(() => new Map(parts.map((p) => [p.id, p.nome])), [parts]);
  const expResps = resps.map((r) => ({ ...r, nome: nameOf.get(r.participant_id) ?? "?" }));
  const filled = (r: Resp) => r.pulou || r.texto.trim() !== "" || r.concordancia !== null;

  return (
    <Tabs defaultValue="campos" className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="campos">Por campo</TabsTrigger>
          <TabsTrigger value="geral">Visão geral</TabsTrigger>
          <TabsTrigger value="config">Configurações</TabsTrigger>
        </TabsList>
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="outline" size="sm" onClick={() => download(`${form.slug}.csv`, toCSV(fields, expResps), "text/csv;charset=utf-8")}><Download className="h-4 w-4" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={() => download(`${form.slug}.md`, toMarkdown(form.titulo, fields, expResps, notes), "text/markdown;charset=utf-8")}><Download className="h-4 w-4" /> Markdown</Button>
        </div>
      </div>

      <TabsContent value="geral">
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left"><th className="p-3">Pessoa</th><th className="p-3">Progresso</th><th className="p-3">Pulados</th><th className="p-3">Última edição</th><th className="p-3">Status</th><th className="p-3">Ações</th></tr></thead>
            <tbody>
              {parts.map((p) => {
                const mine = resps.filter((r) => r.participant_id === p.id);
                return (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="p-3">{p.nome}<span className="block text-xs text-muted-foreground">{p.pin_criado_em ? `PIN criado em ${new Date(p.pin_criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "PIN pendente (redefinido)"}</span></td>
                    <td className="p-3">{mine.filter(filled).length}/{fields.length}</td>
                    <td className="p-3">{mine.filter((r) => r.pulou).length}</td>
                    <td className="p-3">{new Date(p.atualizado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                    <td className="p-3">{p.status === "enviado" ? <span className="text-defined">enviado</span> : "rascunho"}</td>
                    <td className="p-3"><ParticipantActions p={p} onDone={load} /></td>
                  </tr>
                );
              })}
              {!parts.length && <tr><td className="p-3 text-muted-foreground" colSpan={6}>Ninguém entrou ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </TabsContent>

      <TabsContent value="campos">
        <ByField fields={fields} parts={parts} resps={resps} notes={notes} onNoteSaved={load} />
      </TabsContent>

      <TabsContent value="config">
        <Settings form={form} onChanged={() => { onChanged(); load(); }} />
      </TabsContent>
    </Tabs>
  );
}

function ByField({ fields, parts, resps, notes, onNoteSaved }: { fields: Field[]; parts: Participant[]; resps: Resp[]; notes: Note[]; onNoteSaved: () => void }) {
  const [bloco, setBloco] = useState("");
  const [pessoa, setPessoa] = useState("");
  const [q, setQ] = useState("");
  const blocos = [...new Set(fields.map((f) => f.bloco))];
  const ql = q.trim().toLowerCase();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select aria-label="Filtrar por bloco" className="rounded-md border bg-card px-3 py-2 text-sm" value={bloco} onChange={(e) => setBloco(e.target.value)}>
          <option value="">Todos os blocos</option>{blocos.map((b) => <option key={b}>{b}</option>)}
        </select>
        <select aria-label="Filtrar por pessoa" className="rounded-md border bg-card px-3 py-2 text-sm" value={pessoa} onChange={(e) => setPessoa(e.target.value)}>
          <option value="">Todas as pessoas</option>{parts.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input aria-label="Buscar" placeholder="Buscar nas respostas" className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {fields.filter((f) => !bloco || f.bloco === bloco).map((f) => {
        const rs = resps.filter((r) => r.field_id === f.id && (!pessoa || r.participant_id === pessoa) &&
          (!ql || r.texto.toLowerCase().includes(ql) || r.referencia.toLowerCase().includes(ql)));
        if (ql && !rs.length) return null;
        return (
          <section key={f.id} className="rounded-xl border bg-card p-4">
            <p className="terminal-label">{f.bloco}</p>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl">{f.nome}</h2>
              {f.essencial && <span className="rounded-full border border-primary px-2 py-0.5 text-xs text-primary">Essencial para a ficha</span>}
            </div>
            <FieldEditor field={f} answered={resps.some((r) => r.field_id === f.id)} onSaved={onNoteSaved} />
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rs.map((r) => (
                <div key={r.id} className="rounded-lg border bg-muted p-3 text-sm">
                  <p className="font-semibold text-storia-foreground">{parts.find((p) => p.id === r.participant_id)?.nome}</p>
                  {r.pulou ? <p className="italic text-muted-foreground">Pulou</p> : (
                    <>
                      {r.concordancia && <p className="text-xs text-primary">{{ concordo: "Concordo", ajustar: "Quero ajustar", sem_opiniao: "Não tenho opinião" }[r.concordancia]}</p>}
                      <p className="mt-1 whitespace-pre-wrap">{r.texto || "—"}</p>
                      {r.referencia && <p className="mt-2 text-xs text-muted-foreground">Ref.: {r.referencia}</p>}
                    </>
                  )}
                </div>
              ))}
              {!rs.length && <p className="text-sm text-muted-foreground">Sem respostas.</p>}
            </div>
            <NoteEditor fieldId={f.id} note={notes.find((n) => n.field_id === f.id)} onSaved={onNoteSaved} />
          </section>
        );
      })}
    </div>
  );
}

function ParticipantActions({ p, onDone }: { p: Participant; onDone: () => void }) {
  const [typed, setTyped] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const reset = async () => {
    const { data, error } = await supabase.rpc("admin_reset_pin", { _participant_id: p.id });
    if (error || !data) toast.error("Falha ao redefinir PIN."); else { setCode(data); onDone(); }
  };
  const msg = code ? `Seu código para criar um novo PIN no STORIAverso: ${code}. Vale por 24 horas.` : "";
  const remove = async () => {
    const { error } = await supabase.rpc("admin_delete_participant", { _participant_id: p.id });
    if (error) toast.error("Falha ao excluir."); else { toast.success(`${p.nome} e as respostas foram excluídos.`); onDone(); }
  };
  return (
    <div className="flex flex-wrap gap-1">
      <AlertDialog>
        <AlertDialogTrigger asChild><Button size="sm" variant="outline"><KeyRound className="h-4 w-4" /> Redefinir PIN</Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Redefinir o PIN de {p.nome}?</AlertDialogTitle>
            <AlertDialogDescription>O PIN atual deixa de valer e quem estiver conectado com esse nome sai. As respostas ficam guardadas. Você vai receber um código de uso único para enviar à pessoa; com ele, ela cria um PIN novo.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={reset}>Redefinir PIN</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!code} onOpenChange={(o) => { if (!o) setCode(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Código de {p.nome}</AlertDialogTitle>
            <AlertDialogDescription>Este código não será mostrado de novo. Envie para a pessoa; vale por 24 horas.</AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-center font-mono text-3xl tracking-[0.3em]" data-testid="reset-code">{code}</p>
          <p className="rounded-md border bg-muted p-3 text-sm">{msg}</p>
          <AlertDialogFooter>
            <Button variant="outline" onClick={async () => {
              try { await navigator.clipboard.writeText(msg); toast.success("Mensagem copiada."); } catch { toast.error("Não foi possível copiar."); }
            }}><Copy className="h-4 w-4" /> Copiar mensagem</Button>
            <AlertDialogAction onClick={() => setCode(null)}>Fechar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog onOpenChange={() => setTyped("")}>
        <AlertDialogTrigger asChild><Button size="sm" variant="outline" className="text-destructive"><Trash2 className="h-4 w-4" /> Excluir participante e respostas</Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {p.nome} e todas as respostas?</AlertDialogTitle>
            <AlertDialogDescription>Isso não pode ser desfeito. O nome continua na lista de participantes. Para confirmar, digite o nome: <b>{p.nome}</b></AlertDialogDescription>
          </AlertDialogHeader>
          <Input aria-label="Digite o nome para confirmar" value={typed} onChange={(e) => setTyped(e.target.value)} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={typed.trim() !== p.nome} onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FieldEditor({ field, answered, onSaved }: { field: Field; answered: boolean; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ nome: field.nome, o_que_e: field.o_que_e, exemplo: field.exemplo, pergunta: field.pergunta, definicao_atual: field.definicao_atual ?? "" });
  const [busy, setBusy] = useState(false);
  if (!open) return <Button size="sm" variant="ghost" className="mt-1" onClick={() => setOpen(true)}><Pencil className="h-4 w-4" /> Editar textos</Button>;
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <div className="mt-3 space-y-2 rounded-lg border p-3">
      {answered && <p role="note" className="rounded-md bg-muted p-2 text-sm">Este campo já tem respostas. Só a “definição atual” pode ser editada, para não mudar o sentido do que as pessoas responderam.</p>}
      <div className="space-y-1"><Label htmlFor={`fn-${field.id}`}>Nome</Label><Input id={`fn-${field.id}`} maxLength={120} disabled={answered} value={v.nome} onChange={set("nome")} /></div>
      <div className="space-y-1"><Label htmlFor={`fo-${field.id}`}>O que é</Label><Textarea id={`fo-${field.id}`} rows={2} maxLength={2000} disabled={answered} value={v.o_que_e} onChange={set("o_que_e")} /></div>
      <div className="space-y-1"><Label htmlFor={`fe-${field.id}`}>Exemplo</Label><Textarea id={`fe-${field.id}`} rows={2} maxLength={2000} disabled={answered} value={v.exemplo} onChange={set("exemplo")} /></div>
      <div className="space-y-1"><Label htmlFor={`fp-${field.id}`}>Pergunta</Label><Textarea id={`fp-${field.id}`} rows={2} maxLength={2000} disabled={answered} value={v.pergunta} onChange={set("pergunta")} /></div>
      <div className="space-y-1"><Label htmlFor={`fd-${field.id}`}>Definição atual</Label><Textarea id={`fd-${field.id}`} rows={2} maxLength={2000} value={v.definicao_atual} onChange={set("definicao_atual")} /></div>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !v.nome.trim()} onClick={async () => {
          setBusy(true);
          const patch = answered
            ? { definicao_atual: v.definicao_atual.trim() || null }
            : { nome: v.nome.trim(), o_que_e: v.o_que_e, exemplo: v.exemplo, pergunta: v.pergunta, definicao_atual: v.definicao_atual.trim() || null };
          const { error } = await supabase.from("form_fields").update(patch).eq("id", field.id);
          setBusy(false);
          if (error) toast.error(answered ? "Este campo já tem respostas: só a definição atual pode mudar." : "Falha ao salvar.");
          else { toast.success("Campo atualizado para todos."); setOpen(false); onSaved(); }
        }}>Salvar campo</Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
    </div>
  );
}

const STATUSES = ["EM ABERTO", "CANDIDATO", "DECISÃO PROVISÓRIA"] as const;
function NoteEditor({ fieldId, note, onSaved }: { fieldId: string; note: Note | undefined; onSaved: () => void }) {
  const [sintese, setSintese] = useState(note?.sintese ?? "");
  const [status, setStatus] = useState(note?.status ?? "EM ABERTO");
  const [decisao, setDecisao] = useState(note?.decisao_final ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-4 space-y-2 border-t pt-4">
      <p className="terminal-label">Notas do facilitador</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Textarea aria-label="Síntese" placeholder="Síntese" maxLength={5000} value={sintese} onChange={(e) => setSintese(e.target.value)} rows={2} />
        <select aria-label="Status" className="h-10 rounded-md border bg-card px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <Input aria-label="Decisão final" placeholder="Decisão final" maxLength={5000} value={decisao} onChange={(e) => setDecisao(e.target.value)} />
      <Button size="sm" disabled={busy} onClick={async () => {
        setBusy(true);
        const { error } = await supabase.from("facilitator_notes").upsert({ field_id: fieldId, sintese, status, decisao_final: decisao });
        setBusy(false);
        if (error) toast.error("Falha ao salvar nota."); else { toast.success("Nota salva."); onSaved(); }
      }}>Salvar nota</Button>
    </div>
  );
}

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function Settings({ form, onChanged }: { form: Form; onChanged: () => void }) {
  const [prazo, setPrazo] = useState(toLocalInput(form.prazo));
  const [roster, setRoster] = useState<{ id: string; nome: string }[]>([]);
  const [novo, setNovo] = useState("");
  const loadRoster = useCallback(async () => {
    const { data } = await supabase.from("form_roster").select("id,nome").eq("form_id", form.id).order("nome");
    setRoster(data ?? []);
  }, [form.id]);
  useEffect(() => { loadRoster(); }, [loadRoster]);

  const upd = async (patch: Partial<Form>) => {
    const { error } = await supabase.from("forms").update(patch).eq("id", form.id);
    if (error) toast.error("Falha ao salvar."); else { toast.success("Salvo."); onChanged(); }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="text-lg">Prazo de envio</h2>
        <Input type="datetime-local" aria-label="Prazo" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        <Button size="sm" onClick={() => upd({ prazo: prazo ? new Date(prazo).toISOString() : null })}>Salvar prazo</Button>
        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <Label htmlFor="mostrar">Mostrar respostas do grupo para os participantes</Label>
          <Switch id="mostrar" checked={form.mostrar_respostas} onCheckedChange={(v) => upd({ mostrar_respostas: v })} />
        </div>
        <p className="text-xs text-muted-foreground">Link público: /f/{form.slug}</p>
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="text-lg">Nomes</h2>
        <p className="text-sm text-muted-foreground">As pessoas criam o próprio acesso com nome e PIN. Você pode pré-cadastrar nomes. Remover um nome bloqueia o acesso de quem o usa.</p>
        <ul className="space-y-1">
          {roster.map((r) => (
            <li key={r.id} className="flex items-center justify-between text-sm">
              {r.nome}
              <Button variant="ghost" size="sm" aria-label={`Remover ${r.nome}`} onClick={async () => {
                await supabase.from("form_roster").delete().eq("id", r.id); loadRoster();
              }}><Trash2 className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
        <form className="flex gap-2" onSubmit={async (e) => {
          e.preventDefault();
          const n = novo.trim(); if (!n || n.length > 100) return;
          const { error } = await supabase.from("form_roster").insert({ form_id: form.id, nome: n });
          if (error) toast.error(error.code === "23505" ? "Esse nome já existe." : "Não foi possível adicionar."); else { setNovo(""); loadRoster(); }
        }}>
          <Input aria-label="Novo nome" placeholder="Novo nome" maxLength={100} value={novo} onChange={(e) => setNovo(e.target.value)} />
          <Button type="submit" size="sm"><Plus className="h-4 w-4" /></Button>
        </form>
      </div>
    </div>
  );
}

function FormsManager({ forms, onChanged }: { forms: Form[]; onChanged: () => void }) {
  const [json, setJson] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async (raw: unknown) => {
    const parsed = formJsonSchema.safeParse(raw);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "JSON inválido."); return false; }
    const d = parsed.data;
    const { data: f, error } = await supabase.from("forms")
      .insert({ slug: d.slug, titulo: d.titulo, introducao: d.introducao, prazo: d.prazo ?? null, ativo: true })
      .select("id").single();
    if (error || !f) { toast.error(error?.code === "23505" ? "Já existe um formulário com esse slug." : "Falha ao criar."); return false; }
    const r1 = d.nomes.length
      ? await supabase.from("form_roster").insert(d.nomes.map((nome) => ({ form_id: f.id, nome })))
      : { error: null };
    const r2 = await supabase.from("form_fields").insert(d.campos.map((c, i) => ({ ...c, definicao_atual: c.definicao_atual ?? null, ordem: i + 1, form_id: f.id })));
    if (r1.error || r2.error) { await supabase.from("forms").delete().eq("id", f.id); toast.error("Falha ao criar campos."); return false; }
    toast.success(`Criado em /f/${d.slug}`);
    onChanged();
    return true;
  };

  const duplicate = async (src: Form) => {
    const [{ data: fs }, { data: rs }] = await Promise.all([
      supabase.from("form_fields").select("*").eq("form_id", src.id).order("ordem"),
      supabase.from("form_roster").select("nome").eq("form_id", src.id),
    ]);
    await create({
      slug: `${src.slug}-copia-${Date.now().toString(36)}`.slice(0, 80),
      titulo: `${src.titulo} (cópia)`, introducao: src.introducao, prazo: src.prazo,
      nomes: (rs ?? []).map((r) => r.nome),
      campos: (fs ?? []).map(({ bloco, chave, nome, status, essencial, o_que_e, exemplo, pergunta, definicao_atual, comparativo }) =>
        ({ bloco, chave, nome, status, essencial, o_que_e, exemplo, pergunta, definicao_atual, comparativo })),
    });
  };

  return (
    <section className="space-y-4">
      <h2 className="text-2xl">Formulários</h2>
      <ul className="divide-y rounded-xl border bg-card">
        {forms.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
            <span className="font-medium">{f.titulo}</span>
            <span className="text-muted-foreground">/f/{f.slug}</span>
            {!f.ativo && <span className="text-xs text-muted-foreground">(arquivado)</span>}
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={() => duplicate(f)}><Copy className="h-4 w-4" /> Duplicar</Button>
              <Button size="sm" variant="outline" onClick={async () => {
                await supabase.from("forms").update({ ativo: !f.ativo }).eq("id", f.id); onChanged();
              }}><Archive className="h-4 w-4" /> {f.ativo ? "Arquivar" : "Reativar"}</Button>
            </div>
          </li>
        ))}
      </ul>
      <div className="space-y-2 rounded-xl border bg-card p-4">
        <h3 className="text-lg">Novo formulário</h3>
        <p className="text-sm text-muted-foreground">Cole um JSON com slug, titulo, introducao, prazo, nomes e campos.</p>
        <Textarea aria-label="JSON do formulário" rows={10} className="font-mono text-xs" value={json} onChange={(e) => setJson(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={async () => {
            let raw: unknown;
            try { raw = JSON.parse(json); } catch { toast.error("JSON mal formatado."); return; }
            setBusy(true); if (await create(raw)) setJson(""); setBusy(false);
          }}>Criar formulário</Button>
          <Button variant="outline" onClick={() => setJson(JSON.stringify({ ...sample, slug: "novo-encontro", titulo: "Novo encontro" }, null, 2))}>Carregar modelo</Button>
        </div>
      </div>
    </section>
  );
}
