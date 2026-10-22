CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.participants ADD COLUMN pin_criado_em timestamptz;
ALTER TABLE public.participants ADD COLUMN reset_code_hash text NOT NULL DEFAULT '';
ALTER TABLE public.participants ADD COLUMN reset_code_salt text NOT NULL DEFAULT '';
ALTER TABLE public.participants ADD COLUMN reset_code_expira timestamptz;

-- authenticated keeps column-level read only on safe columns (hashes stay unreadable)
GRANT SELECT (pin_criado_em) ON public.participants TO authenticated;

CREATE OR REPLACE FUNCTION public.pin_attempt_gate(_form uuid, _nome text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  last_ok timestamptz;
  fails int;
  fifth timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_form::text || ':' || _nome, 0));
  SELECT max(tentado_em) INTO last_ok FROM public.pin_attempts
    WHERE form_id = _form AND nome = _nome AND sucesso AND tentado_em > now() - interval '10 minutes';
  SELECT count(*), min(tentado_em) INTO fails, fifth FROM (
    SELECT tentado_em FROM public.pin_attempts
    WHERE form_id = _form AND nome = _nome AND NOT sucesso
      AND tentado_em > greatest(now() - interval '10 minutes', coalesce(last_ok, '-infinity'::timestamptz))
    ORDER BY tentado_em DESC LIMIT 5
  ) s;
  IF fails >= 5 THEN
    RETURN 'bloqueado até ' || to_char((fifth + interval '10 minutes') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  END IF;
  INSERT INTO public.pin_attempts (form_id, nome, sucesso) VALUES (_form, _nome, false);
  RETURN 'liberado';
END $$;
REVOKE EXECUTE ON FUNCTION public.pin_attempt_gate(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pin_attempt_gate(uuid, text) TO service_role;

DROP FUNCTION public.admin_reset_pin(uuid);
CREATE FUNCTION public.admin_reset_pin(_participant_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p record;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(6);
  code text := '';
  salt text := encode(extensions.gen_random_bytes(16), 'hex');
  i int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT id, form_id, nome INTO p FROM public.participants WHERE id = _participant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  FOR i IN 0..5 LOOP
    code := code || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  END LOOP;
  UPDATE public.participants SET
    pin_hash = '', pin_salt = '',
    reset_code_salt = salt,
    reset_code_hash = encode(extensions.digest(salt || code, 'sha256'), 'hex'),
    reset_code_expira = now() + interval '24 hours',
    sessao_versao = sessao_versao + 1
  WHERE id = p.id;
  DELETE FROM public.pin_attempts WHERE form_id = p.form_id AND nome = p.nome;
  RETURN code;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_reset_pin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_pin(uuid) TO authenticated;