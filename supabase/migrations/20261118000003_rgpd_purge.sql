-- =============================================================================
-- REVOLia Live — RGPD : suppression automatique
-- =============================================================================
-- Chaque nuit :
--   1. les sessions plus vieilles que leur `retention_jours` sont supprimées,
--      avec participants, réponses, mentions (suppression en cascade) ;
--   2. les identités anonymes des téléphones qui ne participent plus à rien
--      sont supprimées de Supabase Auth.
-- =============================================================================

create or replace function public.purger_donnees_expirees()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  nb_sessions int;
  nb_anonymes int;
begin
  delete from public.sessions
  where cree_le < now() - make_interval(days => retention_jours);
  get diagnostics nb_sessions = row_count;

  delete from auth.users u
  where u.is_anonymous
    and u.created_at < now() - interval '1 day'
    and not exists (select 1 from public.participants p where p.utilisateur_id = u.id);
  get diagnostics nb_anonymes = row_count;

  return jsonb_build_object('sessions_supprimees', nb_sessions, 'anonymes_supprimes', nb_anonymes);
end $$;

revoke execute on function public.purger_donnees_expirees() from public, anon, authenticated;

-- Planification quotidienne (3 h 17, heure UTC) via pg_cron.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('revolia-live-purge-rgpd', '17 3 * * *', 'select public.purger_donnees_expirees()');
