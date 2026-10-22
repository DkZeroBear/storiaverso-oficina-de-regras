ALTER TABLE public.participants ADD COLUMN sessao_versao int NOT NULL DEFAULT 0;
ALTER TABLE public.form_fields ADD COLUMN essencial boolean NOT NULL DEFAULT false;
UPDATE public.form_fields SET essencial = true WHERE chave IN ('motor','atributos','funcao_atributos','pericias','recursos')
  AND form_id IN (SELECT id FROM public.forms WHERE slug = 'oficina-de-regras');
ALTER TABLE public.pin_attempts ADD CONSTRAINT pin_attempts_nome_len CHECK (char_length(nome) BETWEEN 1 AND 100) NOT VALID;

-- PIN hash/salt never readable through the Data API, not even by the admin
REVOKE SELECT, INSERT, UPDATE ON public.participants FROM authenticated;
GRANT SELECT (id, form_id, nome, status, ultimo_campo, enviado_em, atualizado_em, sessao_versao) ON public.participants TO authenticated;
REVOKE INSERT, UPDATE ON public.pin_attempts FROM authenticated;

CREATE OR REPLACE FUNCTION public.admin_reset_pin(_participant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT id, form_id, nome INTO p FROM public.participants WHERE id = _participant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  UPDATE public.participants SET pin_hash = '', pin_salt = '', sessao_versao = sessao_versao + 1 WHERE id = p.id;
  DELETE FROM public.pin_attempts WHERE form_id = p.form_id AND nome = p.nome;
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_participant(_participant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT id, form_id, nome INTO p FROM public.participants WHERE id = _participant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  DELETE FROM public.pin_attempts WHERE form_id = p.form_id AND nome = p.nome;
  DELETE FROM public.responses WHERE participant_id = p.id;
  DELETE FROM public.participants WHERE id = p.id;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_reset_pin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_participant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_pin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_participant(uuid) TO authenticated;

-- Fields with answers: only definicao_atual may change
CREATE OR REPLACE FUNCTION public.guard_answered_field()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.nome, NEW.o_que_e, NEW.exemplo, NEW.pergunta, NEW.bloco, NEW.chave, NEW.status)
     IS DISTINCT FROM (OLD.nome, OLD.o_que_e, OLD.exemplo, OLD.pergunta, OLD.bloco, OLD.chave, OLD.status)
     AND EXISTS (SELECT 1 FROM public.responses WHERE field_id = OLD.id) THEN
    RAISE EXCEPTION 'Campo já tem respostas: só a definição atual pode mudar';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_answered_field() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER form_fields_guard_answered BEFORE UPDATE ON public.form_fields
  FOR EACH ROW EXECUTE FUNCTION public.guard_answered_field();