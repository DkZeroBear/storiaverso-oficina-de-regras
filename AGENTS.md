<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Participant data (participants/responses) is read/written only via server functions in src/lib/oficina.functions.ts using a signed HMAC session token; anon has no policies on those tables — keeps PIN users out of the Data API.
- Admin UI (/admin) uses the browser client and relies on RLS `has_role(auth.uid(),'admin')`; admin roles are granted only manually (no automatic trigger) — the owner decides who is admin.
- Forms are data-driven (forms/form_fields/form_roster); new forms come from JSON validated by src/lib/form-json.ts — never hardcode form content in components.
- Participant names are resolved and registered through service-role-only SQL RPCs with normalized unique indexes; registration locks the form row before counting names and inserting both records — prevents duplicate identities and concurrent over-capacity registrations while keeping the roster private.
- Do not register attachSupabaseAuth in src/start.ts: participant RPCs use HMAC session tokens and the admin uses its browser client directly — keeps the auth client out of participant entry bundles.
- Participant session tokens carry `sessao_versao`; every server function re-checks it. Admin PIN reset (SECURITY DEFINER RPC) bumps the version and returns a one-time code stored only as salted hash with expiry; a reset participant needs that code to set a new PIN. PIN attempts go through the `pin_attempt_gate` SQL function (advisory lock, service_role only) so the lockout is atomic. Hash/salt columns are never granted to anon/authenticated.
- Participant answers are saved through the `save_response` SQL function (service_role only) in one transaction, and the client queues saves per field in `useAutosave` (one in flight per field, flushed before navigating or submitting) — so an older save can never overwrite a newer one.
