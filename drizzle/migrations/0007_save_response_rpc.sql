CREATE OR REPLACE FUNCTION public.save_response(_pid uuid, _versao int, _field uuid, _texto text, _referencia text, _pulou boolean, _concordancia text, _ultimo_campo int)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _fid uuid;
  _ativo boolean;
  _prazo timestamptz;
BEGIN
  SELECT form_id INTO _fid FROM public.participants WHERE id = _pid AND sessao_versao = _versao;
  IF _fid IS NULL THEN RAISE EXCEPTION 'sessao_invalida'; END IF;
  SELECT ativo, prazo INTO _ativo, _prazo FROM public.forms WHERE id = _fid;
  IF NOT COALESCE(_ativo, false) THEN RAISE EXCEPTION 'formulario_indisponivel'; END IF;
  IF _prazo IS NOT NULL AND _prazo < now() THEN RAISE EXCEPTION 'prazo_encerrado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.form_fields WHERE id = _field AND form_id = _fid) THEN
    RAISE EXCEPTION 'campo_invalido';
  END IF;
  INSERT INTO public.responses (participant_id, field_id, texto, referencia, pulou, concordancia, atualizado_em)
  VALUES (_pid, _field,
    CASE WHEN _pulou THEN '' ELSE COALESCE(_texto, '') END,
    CASE WHEN _pulou THEN '' ELSE COALESCE(_referencia, '') END,
    _pulou,
    CASE WHEN _pulou THEN NULL ELSE _concordancia END,
    now())
  ON CONFLICT (participant_id, field_id) DO UPDATE SET
    texto = EXCLUDED.texto, referencia = EXCLUDED.referencia, pulou = EXCLUDED.pulou,
    concordancia = EXCLUDED.concordancia, atualizado_em = EXCLUDED.atualizado_em;
  UPDATE public.participants SET atualizado_em = now(), ultimo_campo = _ultimo_campo WHERE id = _pid;
  RETURN now();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.save_response(uuid, int, uuid, text, text, boolean, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_response(uuid, int, uuid, text, text, boolean, text, int) TO service_role;