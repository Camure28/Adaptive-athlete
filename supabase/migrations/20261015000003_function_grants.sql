-- Supabase grants EXECUTE on new public functions to anon and authenticated by default.
-- Our functions already refuse signed-out callers, but remove the grant so they can't be called at all.
revoke execute on function public.owns_athlete(uuid) from anon;
revoke execute on function public.export_my_data() from anon;
revoke execute on function public.save_hyrox_onboarding(jsonb) from anon;
revoke execute on function public.set_updated_at() from anon, authenticated;
revoke execute on function public.forbid_update() from anon, authenticated;
revoke execute on function public.forbid_owner_change() from anon, authenticated;
