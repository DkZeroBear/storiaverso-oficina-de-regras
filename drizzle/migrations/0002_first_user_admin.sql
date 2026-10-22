CREATE OR REPLACE FUNCTION public.grant_first_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.grant_first_admin() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created_first_admin
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.grant_first_admin();