CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9-]{2,80}$'),
  titulo text NOT NULL CHECK (char_length(titulo) <= 200),
  introducao text NOT NULL DEFAULT '' CHECK (char_length(introducao) <= 4000),
  ativo boolean NOT NULL DEFAULT true,
  prazo timestamptz,
  mostrar_respostas boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.forms TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forms TO authenticated;
GRANT ALL ON public.forms TO service_role;
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public reads active forms" ON public.forms FOR SELECT TO anon, authenticated USING (ativo = true);
CREATE POLICY "admin all forms" ON public.forms FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  ordem int NOT NULL,
  bloco text NOT NULL CHECK (char_length(bloco) <= 120),
  chave text NOT NULL CHECK (char_length(chave) <= 80),
  nome text NOT NULL CHECK (char_length(nome) <= 120),
  status text NOT NULL CHECK (status IN ('propor','definido')),
  o_que_e text NOT NULL DEFAULT '',
  exemplo text NOT NULL DEFAULT '',
  pergunta text NOT NULL DEFAULT '',
  definicao_atual text,
  comparativo jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (form_id, chave)
);
GRANT SELECT ON public.form_fields TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_fields TO authenticated;
GRANT ALL ON public.form_fields TO service_role;
ALTER TABLE public.form_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public reads fields of active forms" ON public.form_fields FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_id AND f.ativo));
CREATE POLICY "admin all fields" ON public.form_fields FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.form_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 100),
  UNIQUE (form_id, nome)
);
GRANT SELECT ON public.form_roster TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_roster TO authenticated;
GRANT ALL ON public.form_roster TO service_role;
ALTER TABLE public.form_roster ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public reads roster of active forms" ON public.form_roster FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_id AND f.ativo));
CREATE POLICY "admin all roster" ON public.form_roster FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 100),
  pin_hash text NOT NULL,
  pin_salt text NOT NULL,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','enviado')),
  ultimo_campo int NOT NULL DEFAULT 0,
  enviado_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_id, nome)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.participants TO authenticated;
GRANT ALL ON public.participants TO service_role;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all participants" ON public.participants FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES public.form_fields(id) ON DELETE CASCADE,
  texto text NOT NULL DEFAULT '' CHECK (char_length(texto) <= 1200),
  referencia text NOT NULL DEFAULT '' CHECK (char_length(referencia) <= 200),
  pulou boolean NOT NULL DEFAULT false,
  concordancia text CHECK (concordancia IN ('concordo','ajustar','sem_opiniao')),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_id, field_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.responses TO authenticated;
GRANT ALL ON public.responses TO service_role;
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all responses" ON public.responses FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.facilitator_notes (
  field_id uuid PRIMARY KEY REFERENCES public.form_fields(id) ON DELETE CASCADE,
  sintese text NOT NULL DEFAULT '' CHECK (char_length(sintese) <= 5000),
  status text NOT NULL DEFAULT 'EM ABERTO' CHECK (status IN ('DECISÃO PROVISÓRIA','CANDIDATO','EM ABERTO')),
  decisao_final text NOT NULL DEFAULT '' CHECK (char_length(decisao_final) <= 5000)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.facilitator_notes TO authenticated;
GRANT ALL ON public.facilitator_notes TO service_role;
ALTER TABLE public.facilitator_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all notes" ON public.facilitator_notes FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pin_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tentado_em timestamptz NOT NULL DEFAULT now(),
  sucesso boolean NOT NULL
);
CREATE INDEX pin_attempts_lookup ON public.pin_attempts (form_id, nome, tentado_em DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pin_attempts TO authenticated;
GRANT ALL ON public.pin_attempts TO service_role;
ALTER TABLE public.pin_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all attempts" ON public.pin_attempts FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));