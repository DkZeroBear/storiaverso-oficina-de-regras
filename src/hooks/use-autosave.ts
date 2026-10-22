import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { saveResponse, type MyResponse } from "@/lib/oficina.functions";

export type SaveStatus = "idle" | "saving" | "saved" | "error";
export type AutosavePayload = MyResponse & { ultimo_campo: number };

type Entry = {
  pending: AutosavePayload | null;
  timer: ReturnType<typeof setTimeout> | null;
  inflight: Promise<void> | null;
  dirty: boolean;
};

const DELAY = 700;

/** One serialized save queue per field: never two concurrent saves of the same field; the last sent is always the newest. */
export function useAutosave(token: string) {
  const save = useServerFn(saveResponse);
  const entries = useRef(new Map<string, Entry>());
  const [status, setStatus] = useState<Record<string, SaveStatus>>({});
  const [hasPending, setHasPending] = useState(false);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const get = (id: string) => {
    let e = entries.current.get(id);
    if (!e) entries.current.set(id, (e = { pending: null, timer: null, inflight: null, dirty: false }));
    return e;
  };
  const setSt = (id: string, s: SaveStatus) => setStatus((p) => (p[id] === s ? p : { ...p, [id]: s }));
  const recompute = () =>
    setHasPending([...entries.current.values()].some((e) => e.pending || e.inflight || e.timer));

  const run = useCallback((id: string): Promise<void> => {
    const e = get(id);
    if (e.inflight) { e.dirty = true; return e.inflight; }
    const payload = e.pending;
    if (!payload) return Promise.resolve();
    e.dirty = false;
    setSt(id, "saving");
    const p = (async () => {
      try {
        await save({ data: { token: tokenRef.current, ...payload } });
        if (e.pending === payload) e.pending = null;
        e.inflight = null;
        if (e.pending && (e.dirty || !e.timer)) { await run(id); return; }
        setSt(id, e.pending || e.timer ? "saving" : "saved");
      } catch (err) {
        e.inflight = null;
        setSt(id, "error");
        toast.error(err instanceof Error ? err.message : "Falha ao salvar.");
        throw err;
      } finally {
        recompute();
      }
    })();
    e.inflight = p;
    recompute();
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save]);

  const schedule = useCallback((id: string, payload: AutosavePayload) => {
    const e = get(id);
    e.pending = payload;
    if (e.timer) clearTimeout(e.timer);
    e.timer = setTimeout(() => { e.timer = null; run(id).catch(() => {}); }, DELAY);
    setSt(id, "saving");
    recompute();
  }, [run]);

  const retry = useCallback((id: string) => { run(id).catch(() => {}); }, [run]);

  const flushAll = useCallback(async () => {
    let failed = false;
    for (;;) {
      const work: Promise<void>[] = [];
      for (const [id, e] of entries.current) {
        if (e.timer) { clearTimeout(e.timer); e.timer = null; }
        if (e.inflight) work.push(e.inflight.catch(() => { failed = true; }));
        else if (e.pending) work.push(run(id).catch(() => { failed = true; }));
      }
      if (!work.length) break;
      await Promise.all(work);
      if (failed) break;
    }
    recompute();
    if (failed) throw new Error("Algumas respostas não foram salvas. Tente de novo.");
  }, [run]);

  useEffect(() => {
    if (!hasPending) return;
    const h = (ev: BeforeUnloadEvent) => { ev.preventDefault(); ev.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [hasPending]);

  return { schedule, flushAll, retry, status, hasPending };
}

export type Autosave = ReturnType<typeof useAutosave>;
