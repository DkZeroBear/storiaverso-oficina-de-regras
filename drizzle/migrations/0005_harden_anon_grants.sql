REVOKE ALL ON public.user_roles, public.forms, public.form_fields, public.form_roster, public.participants, public.pin_attempts, public.responses, public.facilitator_notes FROM anon, PUBLIC;
GRANT SELECT ON public.forms, public.form_fields, public.form_roster TO anon;
REVOKE ALL ON public.participants FROM authenticated;
GRANT SELECT (id, form_id, nome, status, ultimo_campo, enviado_em, atualizado_em, sessao_versao) ON public.participants TO authenticated;
GRANT DELETE ON public.participants TO authenticated;
REVOKE INSERT, UPDATE ON public.pin_attempts FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;