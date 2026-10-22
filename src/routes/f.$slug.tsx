import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Check, ChevronDown, Clock, Lock, Save, ShieldCheck, Loader2,
} from "lucide-react";
import {
  checkName, getGroupResponses, getPublicForm, getRequestOrigin, identify, resume, saveProgress,
  submitResponses, type MyResponse, type MyState, type PublicField,
} from "@/lib/oficina.functions";
import { SYSTEMS, fieldIcon, formatPrazo, PARTICIPANT_PRIVACY } from "@/lib/systems";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { MyExportMenu, MyPrintView } from "@/components/MyExportMenu";
import { formatNow, type MyExport } from "@/lib/my-export";
import { useAutosave, type Autosave } from "@/hooks/use-autosave";
import { createPortal } from "react-dom";
import ogAsset from "@/assets/storiaverso-og.jpg.asset.json";

export const Route = createFileRoute("/f/$slug")({
  loader: async ({ params }) => {
    const [form, origin] = await Promise.all([getPublicForm({ data: { slug: params.slug } }), getRequestOrigin()]);
    if (!form) throw notFound();
    return { ...form, origin };
  },
  head: ({ loaderData }) => {
    const t = loaderData ? `STORIAverso · ${loaderData.titulo}` : "STORIAverso · Oficinas";
    const d = "Formulário de regras do jogo. Leva de 15 a 25 minutos. Só o facilitador vê as respostas.";
    const img = loaderData ? `${loaderData.origin}${ogAsset.url}` : null;
    return {
      meta: [
        { title: t },
        { name: "description", content: d },
        { property: "og:title", content: t },
        { property: "og:description", content: d },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        ...(img
          ? [
              { property: "og:image", content: img },
              { property: "og:image:width", content: "1200" },
              { property: "og:image:height", content: "630" },
              { name: "twitter:image", content: img },
            ]
          : []),
      ],
    };
  },
  component: FormPage,
});

type Stage = "welcome" | "identify" | "form" | "final";
const emptyResp = (field_id: string): MyResponse => ({
  field_id, texto: "", referencia: "", pulou: false, concordancia: null,
});
const isFilled = (r?: MyResponse) => !!r && (r.pulou || r.texto.trim() !== "" || r.concordancia !== null);

function FormPage() {
  const form = Route.useLoaderData();
  const storageKey = `storia-token:${form.slug}`;
  const [stage, setStage] = useState<Stage>("welcome");
  const [me, setMe] = useState<MyState | null>(null);
  const [resp, setResp] = useState<Record<string, MyResponse>>({});
  const [step, setStep] = useState(0);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const resumeFn = useServerFn(resume);
  const autosave = useAutosave(me?.token ?? "");
  const progressFn = useServerFn(saveProgress);
  const lastProgress = useRef<number | null>(null);
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCardFocus = (idx: number) => {
    if (!me || idx === lastProgress.current) return;
    if (progressTimer.current) clearTimeout(progressTimer.current);
    progressTimer.current = setTimeout(() => {
      lastProgress.current = idx;
      progressFn({ data: { token: me.token, ultimo_campo: idx } }).catch(() => {});
    }, 1000);
  };
  const flushThen = async (go: () => void) => {
    try { await autosave.flushAll(); } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao salvar."); }
    go();
  };
  const [printData, setPrintData] = useState<MyExport | null>(null);

  useEffect(() => {
    if (!printData) return;
    document.body.classList.add("printing-mine");
    const done = () => { document.body.classList.remove("printing-mine"); setPrintData(null); };
    window.addEventListener("afterprint", done, { once: true });
    const t = setTimeout(() => window.print(), 50);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", done); document.body.classList.remove("printing-mine"); };
  }, [printData]);

  const blocks = useMemo(() => {
    const m: { nome: string; fields: (PublicField & { idx: number })[] }[] = [];
    form.fields.forEach((f, idx) => {
      let b = m.find((x) => x.nome === f.bloco);
      if (!b) m.push((b = { nome: f.bloco, fields: [] }));
      b.fields.push({ ...f, idx });
    });
    return m;
  }, [form.fields]);

  const enter = (s: MyState) => {
    setMe(s);
    sessionStorage.setItem(storageKey, s.token);
    setResp(Object.fromEntries(s.responses.map((r) => [r.field_id, r])));
    const idx = Math.min(s.ultimo_campo, form.fields.length - 1);
    const b = blocks.findIndex((bl) => bl.fields.some((f) => f.idx === idx));
    setStep(Math.max(0, b));
    setFocusIdx(idx);
    lastProgress.current = s.ultimo_campo;
    setStage("form");
  };

  useEffect(() => {
    const t = sessionStorage.getItem(storageKey);
    if (!t) return;
    resumeFn({ data: { token: t } })
      .then((r) => {
        if (r && r.fid === form.id) enter(r.state);
        else sessionStorage.removeItem(storageKey);
      })
      .catch(() => sessionStorage.removeItem(storageKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filled = form.fields.filter((f) => isFilled(resp[f.id])).length;
  const closed = !!form.prazo && new Date(form.prazo).getTime() < Date.now();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-32 pt-8">
      <header className="mb-8">
        <p className="terminal-label">STORIAverso · Oficinas</p>
        <h1 className="mt-1 text-3xl sm:text-4xl">{form.titulo}</h1>
      </header>

      {stage === "welcome" && <Welcome form={form} closed={closed} onStart={() => setStage("identify")} />}
      {stage === "identify" && <Identify formId={form.id} roster={form.roster} onDone={enter} />}
      {stage === "form" && me && (
        <>
          <ProgressBar filled={filled} total={form.fields.length} nome={me.nome}
            blocks={blocks.map((b) => ({ nome: b.nome, done: b.fields.every((f) => isFilled(resp[f.id])) }))}
            current={step}
            onJump={(i) => flushThen(() => { setFocusIdx(null); setStep(i); window.scrollTo(0, 0); })} />
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <MyExportMenu token={me.token} onPrint={setPrintData} />
            {closed && <span className="text-sm text-muted-foreground">Prazo encerrado: modo leitura.</span>}
          </div>
          <Block
            key={step}
            block={blocks[step] ?? { nome: "", fields: [] }}
            stepLabel={`Etapa ${step + 1} de ${blocks.length}`}
            resp={resp}
            setResp={setResp}
            autosave={autosave}
            onCardFocus={onCardFocus}
            readOnly={closed}
            focusIdx={focusIdx}
          />
          <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/90 backdrop-blur">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
              <Button
                variant="outline"
                disabled={step === 0}
                onClick={() => flushThen(() => { setFocusIdx(null); setStep(step - 1); window.scrollTo(0, 0); })}
              >
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
              <span className="text-sm text-muted-foreground">{filled} de {form.fields.length} campos</span>
              <Button
                onClick={() => flushThen(() => {
                  setFocusIdx(null);
                  window.scrollTo(0, 0);
                  if (step < blocks.length - 1) setStep(step + 1);
                  else setStage("final");
                })}
              >
                {step < blocks.length - 1 ? "Próximo" : "Revisar"} <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </nav>
        </>
      )}
      {stage === "final" && me && (
        <Final
          fields={form.fields}
          resp={resp}
          me={me}
          flushAll={autosave.flushAll}
          closed={closed}
          mostrar={form.mostrar_respostas}
          onBack={() => { setStep(blocks.length - 1); setStage("form"); }}
          onSubmitted={(enviado) => setMe({ ...me, status: enviado ? "enviado" : me.status })}
          onPrint={setPrintData}
        />
      )}
      {printData && typeof document !== "undefined" &&
        createPortal(<div id="print-root"><MyPrintView data={printData} now={formatNow(new Date())} /></div>, document.body)}
    </main>
  );
}

function Welcome({ form, closed, onStart }: { form: { introducao: string; prazo: string | null }; closed: boolean; onStart: () => void }) {
  return (
    <section className="fade-up space-y-6">
      <p className="text-lg">Não existe resposta certa. O objetivo é reunir ideias para decidirmos juntos.</p>
      <p className="text-muted-foreground">{form.introducao}</p>
      <ul className="space-y-2 rounded-xl border bg-card p-5 text-sm">
        <li>• Você vai preencher a coluna “STORIAverso” com ideias próprias, campo por campo.</li>
        <li>• Leva cerca de 15 a 25 minutos. Você pode salvar e voltar depois.</li>
        <li>• Não é preciso preencher tudo: existe a opção “Não sei / pular”.</li>
        <li>• Se faltar tempo, comece pelos campos marcados como <b>Essencial para a ficha</b>.</li>
      </ul>
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-defined" /> {PARTICIPANT_PRIVACY}
      </p>
      <p className="flex items-center gap-2 text-sm">
        <Clock className="h-4 w-4 text-primary" /> Prazo: {formatPrazo(form.prazo)}
        {closed && <span className="text-destructive"> (encerrado)</span>}
      </p>
      <Button size="lg" onClick={onStart}>Começar <ArrowRight className="h-4 w-4" /></Button>
    </section>
  );
}

function Identify({ formId, roster, onDone }: { formId: string; roster: string[]; onDone: (s: MyState) => void }) {
  const [nome, setNome] = useState("");
  const [exists, setExists] = useState<boolean | null>(null);
  const [reset, setReset] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const check = useServerFn(checkName);
  const ident = useServerFn(identify);

  const pick = async (n: string) => {
    setNome(n); setErr(""); setPin(""); setPin2(""); setCodigo(""); setExists(null);
    const r = await check({ data: { formId, nome: n } });
    setReset(r.reset);
    setExists(r.exists);
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!/^\d{4}$/.test(pin)) return setErr("O PIN deve ter 4 dígitos.");
    if (!exists && pin !== pin2) return setErr("Os PINs não coincidem.");
    if (reset && codigo.trim().length !== 6) return setErr("Digite o código de 6 caracteres que o facilitador te enviou.");
    setBusy(true);
    try {
      const r = await ident({ data: { formId, nome, pin, ...(reset ? { codigo: codigo.trim() } : {}) } });
      if (r.ok) onDone(r.state);
      else setErr(r.error);
    } catch {
      setErr("Não foi possível entrar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="fade-up space-y-6">
      <div>
        <h2 className="text-2xl">Quem é você?</h2>
        <p className="mt-2 text-sm text-muted-foreground">Escolha o seu próprio nome e crie o PIN agora. Se o seu nome já estiver em uso sem ter sido você, avise o facilitador.</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {roster.map((n) => (
            <Button key={n} variant={nome === n ? "default" : "outline"} onClick={() => pick(n)} aria-pressed={nome === n}>
              {n}
            </Button>
          ))}
        </div>
      </div>
      {nome && exists !== null && (
        <form onSubmit={submit} className="fade-up space-y-4 rounded-xl border bg-card p-5">
          <p className="flex items-center gap-2 text-sm">
            <Lock className="h-4 w-4 text-primary" />
            {exists ? "Digite seu PIN para continuar de onde parou." : reset ? "Seu PIN foi redefinido. Digite o código que o facilitador te enviou e crie um PIN novo. Suas respostas continuam guardadas." : "Crie um PIN de 4 dígitos para voltar depois."}
          </p>
          {reset && (
            <div className="space-y-1">
              <Label htmlFor="codigo">Código do facilitador</Label>
              <Input id="codigo" autoComplete="off" autoCapitalize="characters" maxLength={6} value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} className="max-w-[12rem] text-center text-xl tracking-[0.3em]" />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="pin">{reset ? "Novo PIN" : "PIN"}</Label>
            <Input id="pin" inputMode="numeric" autoComplete="off" maxLength={4} value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="max-w-[10rem] text-center text-xl tracking-[0.5em]" />
          </div>
          {!exists && (
            <div className="space-y-1">
              <Label htmlFor="pin2">Repita o PIN</Label>
              <Input id="pin2" inputMode="numeric" autoComplete="off" maxLength={4} value={pin2}
                onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} className="max-w-[10rem] text-center text-xl tracking-[0.5em]" />
            </div>
          )}
          {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Entrar
          </Button>
        </form>
      )}
    </section>
  );
}

function ProgressBar({ filled, total, nome, blocks, current, onJump }: {
  filled: number; total: number; nome: string;
  blocks: { nome: string; done: boolean }[]; current: number; onJump: (i: number) => void;
}) {
  return (
    <div className="sticky top-0 z-10 -mx-4 mb-6 border-b bg-background/90 px-4 py-3 backdrop-blur">
      <div className="flex justify-between text-sm">
        <span>{nome}</span>
        <span className="text-muted-foreground">{filled} de {total} campos</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={filled} aria-valuemax={total}>
        <div className="h-full bg-primary transition-all" style={{ width: `${(filled / total) * 100}%` }} />
      </div>
      <nav aria-label="Ir para o bloco" className="mt-2 flex flex-wrap gap-1.5">
        {blocks.map((b, i) => (
          <button key={b.nome} type="button" onClick={() => onJump(i)} aria-current={i === current ? "step" : undefined}
            className={`rounded-full border px-2.5 py-0.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${i === current ? "border-primary bg-primary text-primary-foreground" : b.done ? "border-defined text-defined" : "text-muted-foreground hover:text-foreground"}`}>
            {i + 1}. {b.nome}{b.done && i !== current ? " ✓" : ""}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Block(props: {
  block: { nome: string; fields: (PublicField & { idx: number })[] };
  stepLabel: string;
  resp: Record<string, MyResponse>;
  setResp: React.Dispatch<React.SetStateAction<Record<string, MyResponse>>>;
  autosave: Autosave;
  onCardFocus: (idx: number) => void;
  readOnly: boolean;
  focusIdx: number | null;
}) {
  const { block, focusIdx } = props;
  useEffect(() => {
    if (focusIdx == null) return;
    document.getElementById(`campo-${focusIdx}`)?.scrollIntoView({ block: "start" });
  }, [focusIdx]);
  return (
    <section className="fade-up space-y-6">
      <div>
        <p className="terminal-label">{props.stepLabel}</p>
        <h2 className="mt-1 text-2xl">Bloco {block.nome}</h2>
      </div>
      {block.fields.map((f) => (
        <FieldCard key={f.id} field={f} {...props} />
      ))}
    </section>
  );
}

function FieldCard({ field, resp, setResp, autosave, onCardFocus, readOnly }: {
  field: PublicField & { idx: number };
  resp: Record<string, MyResponse>;
  setResp: React.Dispatch<React.SetStateAction<Record<string, MyResponse>>>;
  autosave: Autosave;
  onCardFocus: (idx: number) => void;
  readOnly: boolean;
}) {
  const r = resp[field.id] ?? emptyResp(field.id);
  const saved = autosave.status[field.id] ?? "idle";
  const [open, setOpen] = useState(false);
  const Icon = fieldIcon(field.chave);
  const defined = field.status === "definido";
  const comp = (field.comparativo ?? {}) as Record<string, string>;

  const update = (patch: Partial<MyResponse>) => {
    const next = { ...r, ...patch };
    if (next.pulou) next.concordancia = null;
    setResp((p) => ({ ...p, [field.id]: next }));
    autosave.schedule(field.id, { ...next, ultimo_campo: field.idx });
  };

  return (
    <article id={`campo-${field.idx}`} className="scroll-mt-24 space-y-4 rounded-xl border bg-card p-5 card-glow"
      onFocusCapture={() => onCardFocus(field.idx)}>
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="h-5 w-5 text-primary" aria-hidden />
        <h3 className="text-xl">{field.nome}</h3>
        {field.essencial && (
          <span className="rounded-full border border-primary px-2.5 py-0.5 text-xs font-medium text-primary">Essencial para a ficha</span>
        )}
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium ${defined ? "bg-defined text-defined-foreground" : "bg-storia text-storia-foreground"}`}>
          {defined ? "Já definido no documento" : "Para propor"}
        </span>
      </div>
      <div>
        <p className="terminal-label">O que é</p>
        <p className="mt-1">{field.o_que_e}</p>
      </div>
      <div className="rounded-lg border">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm">
          Como outros sistemas fazem <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <dl className="grid gap-2 border-t p-3 sm:grid-cols-2">
            {SYSTEMS.map((s) => (
              <div key={s.key}>
                <dt className="terminal-label">{s.label}</dt>
                <dd className="text-sm">{comp[s.key] ?? "—"}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div className="rounded-lg border border-dashed p-3">
        <p className="terminal-label">Exemplo de formato, não é sugestão para o nosso jogo</p>
        <p className="mt-1 text-sm italic text-muted-foreground">Piratas de dirigíveis: “{field.exemplo}”</p>
      </div>
      {defined && field.definicao_atual && (
        <div className="rounded-lg border-l-4 border-defined bg-muted p-3">
          <p className="terminal-label">Definição atual do grupo</p>
          <p className="mt-1">{field.definicao_atual}</p>
        </div>
      )}
      <p className="font-medium">{field.pergunta}</p>

      {defined && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Concordância">
          {([["concordo", "Concordo"], ["ajustar", "Quero ajustar"], ["sem_opiniao", "Não tenho opinião"]] as const).map(([v, l]) => (
            <Button key={v} size="sm" type="button" variant={r.concordancia === v ? "default" : "outline"}
              disabled={readOnly || r.pulou} aria-pressed={r.concordancia === v}
              onClick={() => update({ concordancia: r.concordancia === v ? null : v })}>
              {l}
            </Button>
          ))}
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor={`t-${field.id}`}>{defined ? "Concorda ou quer ajustar? (opcional)" : "Sua proposta"}</Label>
        <Textarea id={`t-${field.id}`} rows={6} maxLength={1200} value={r.texto} disabled={readOnly || r.pulou}
          onChange={(e) => update({ texto: e.target.value })} className="text-base" />
        <p className="text-right text-xs text-muted-foreground">{r.texto.length}/1200</p>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`r-${field.id}`}>Referência que te inspirou (jogo, filme, anime…)</Label>
        <Input id={`r-${field.id}`} maxLength={200} value={r.referencia} disabled={readOnly || r.pulou}
          onChange={(e) => update({ referencia: e.target.value })} />
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={r.pulou} disabled={readOnly} onCheckedChange={(v) => update({ pulou: v === true })} />
          Não sei / pular
        </label>
        <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
          {saved === "saving" && <><Save className="h-3 w-3" /> Salvando…</>}
          {saved === "saved" && <><Check className="h-3 w-3 text-defined" /> Salvo</>}
          {saved === "error" && (
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => autosave.retry(field.id)}>
              Tentar de novo
            </Button>
          )}
        </span>
      </div>
    </article>
  );
}

function Final({ fields, resp, me, flushAll, closed, mostrar, onBack, onSubmitted, onPrint }: {
  onPrint: (e: MyExport) => void;
  fields: PublicField[];
  resp: Record<string, MyResponse>;
  me: MyState;
  flushAll: () => Promise<void>;
  closed: boolean;
  mostrar: boolean;
  onBack: () => void;
  onSubmitted: (ok: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(me.status === "enviado");
  const submit = useServerFn(submitResponses);
  const group = useServerFn(getGroupResponses);
  const [groupData, setGroupData] = useState<Awaited<ReturnType<typeof getGroupResponses>>>(null);

  useEffect(() => {
    if (mostrar && done) group({ data: { token: me.token } }).then(setGroupData).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrar, done]);

  const send = async () => {
    setBusy(true);
    try {
      await flushAll();
    } catch {
      toast.error("Algumas respostas não foram salvas. Tente de novo.");
      setBusy(false);
      return;
    }
    try {
      await submit({ data: { token: me.token } });
      setDone(true);
      onSubmitted(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="fade-up space-y-6">
      <h2 className="text-2xl">Resumo</h2>
      <ul className="divide-y rounded-xl border bg-card">
        {fields.map((f) => {
          const r = resp[f.id];
          const st = !r || !isFilled(r) ? "Em branco" : r.pulou ? "Pulado" : "Preenchido";
          return (
            <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span>{f.nome}</span>
              <span className={st === "Preenchido" ? "text-defined" : "text-muted-foreground"}>{st}</span>
            </li>
          );
        })}
      </ul>
      {done ? (
        <div className="rounded-xl border border-defined bg-card p-5">
          <p className="font-medium">Obrigado, {me.nome}. Suas respostas foram enviadas.</p>
          <p className="mt-1 text-sm text-muted-foreground">Você pode voltar e editar até o fim do prazo.</p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Voltar e editar</Button>
        <MyExportMenu token={me.token} onPrint={onPrint} />
        <Button onClick={send} disabled={busy || closed}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {done ? "Enviar de novo" : "Enviar respostas"}
        </Button>
      </div>
      {mostrar && !done && (
        <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Envie suas respostas para ver as do grupo.</p>
      )}
      {mostrar && done && groupData && (
        <div className="space-y-4">
          <h2 className="text-2xl">Respostas do grupo</h2>
          {fields.map((f) => {
            const rs = groupData.filter((g) => g.field_id === f.id);
            if (!rs.length) return null;
            return (
              <div key={f.id} className="rounded-xl border bg-card p-4">
                <h3 className="text-lg">{f.nome}</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {rs.map((g) => (
                    <li key={g.participant_id}>
                      <b>{g.nome}:</b>{" "}
                      {g.pulou ? <i>pulou</i> : (
                        <>
                          {g.concordancia && <span className="font-medium">{CONCORDANCIA_LABEL[g.concordancia] ?? g.concordancia}{g.texto ? " — " : ""}</span>}
                          {g.texto || (!g.concordancia && "—")}
                          {g.referencia && <span className="block text-muted-foreground">Ref.: {g.referencia}</span>}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
