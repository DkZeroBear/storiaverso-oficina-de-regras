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
