CREATE UNIQUE INDEX form_roster_normalized_name_unique ON public.form_roster (form_id, lower(btrim(nome)));
CREATE UNIQUE INDEX participants_normalized_name_unique ON public.participants (form_id, lower(btrim(nome)));
REVOKE SELECT ON public.form_roster FROM anon;
ALTER POLICY "public reads roster of active forms" ON public.form_roster TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.resolver_nome(_form uuid, _nome text)
RETURNS TABLE (nome_lista text, participante_id uuid, tem_pin boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT r.nome FROM public.form_roster r WHERE r.form_id = _form AND lower(btrim(r.nome)) = lower(btrim(_nome))),
    (SELECT p.id FROM public.participants p WHERE p.form_id = _form AND lower(btrim(p.nome)) = lower(btrim(_nome))),
    COALESCE((SELECT p.pin_hash <> '' FROM public.participants p WHERE p.form_id = _form AND lower(btrim(p.nome)) = lower(btrim(_nome))), false);
$$;
REVOKE EXECUTE ON FUNCTION public.resolver_nome(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_nome(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.criar_participante(_form uuid, _nome text, _pin_hash text, _pin_salt text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ativo boolean;
  _prazo timestamptz;
  _nome_lista text;
  _id uuid;
BEGIN
  SELECT ativo, prazo INTO _ativo, _prazo FROM public.forms WHERE id = _form FOR UPDATE;
  IF NOT FOUND OR NOT _ativo THEN RAISE EXCEPTION 'formulario_indisponivel'; END IF;
  IF _prazo IS NOT NULL AND _prazo < now() THEN RAISE EXCEPTION 'prazo_encerrado'; END IF;
  IF EXISTS (SELECT 1 FROM public.participants WHERE form_id = _form AND lower(btrim(nome)) = lower(btrim(_nome))) THEN
    RAISE EXCEPTION 'nome_existente';
  END IF;
  SELECT nome INTO _nome_lista FROM public.form_roster WHERE form_id = _form AND lower(btrim(nome)) = lower(btrim(_nome));
  IF _nome_lista IS NULL THEN
    IF (SELECT count(*) FROM public.form_roster WHERE form_id = _form) >= 50 THEN RAISE EXCEPTION 'lista_cheia'; END IF;
    INSERT INTO public.form_roster(form_id,nome) VALUES (_form,btrim(_nome)) RETURNING nome INTO _nome_lista;
  END IF;
  INSERT INTO public.participants(form_id,nome,pin_hash,pin_salt,pin_criado_em)
  VALUES (_form,_nome_lista,_pin_hash,_pin_salt,now()) RETURNING id INTO _id;
  RETURN _id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'nome_existente';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.criar_participante(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_participante(uuid,text,text,text) TO service_role;