-- =============================================================================
-- Espace administrateur
--   * formateurs.est_admin : peut voir, modifier, dupliquer et supprimer TOUS les quiz,
--     et gérer les formateurs ;
--   * formateurs.actif : un formateur « retiré » est désactivé (ses quiz sont conservés).
-- L'attribution du premier admin se fait à la main (hors dépôt, aucune donnée perso ici).
-- =============================================================================
alter table public.formateurs
  add column est_admin boolean not null default false,
  add column actif boolean not null default true;

create or replace function public.est_formateur()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.formateurs where id = auth.uid() and actif);
$$;

create or replace function public.est_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.formateurs where id = auth.uid() and actif and est_admin);
$$;
revoke execute on function public.est_admin() from public, anon;
grant execute on function public.est_admin() to authenticated;

-- Quiz et questions : le propriétaire actif, ou un admin.
drop policy "formateur gère ses quiz" on public.quiz;
create policy "formateur ou admin gère les quiz" on public.quiz
  for all to authenticated
  using ((formateur_id = auth.uid() and public.est_formateur()) or public.est_admin())
  with check ((formateur_id = auth.uid() and public.est_formateur()) or public.est_admin());

drop policy "formateur gère ses questions" on public.questions;
create policy "formateur ou admin gère les questions" on public.questions
  for all to authenticated
  using (exists (select 1 from public.quiz q where q.id = quiz_id
                 and ((q.formateur_id = auth.uid() and public.est_formateur()) or public.est_admin())))
  with check (exists (select 1 from public.quiz q where q.id = quiz_id
                 and ((q.formateur_id = auth.uid() and public.est_formateur()) or public.est_admin())));

-- L'admin lit la liste des formateurs et tout le journal d'utilisation.
create policy "admin lit les formateurs" on public.formateurs
  for select to authenticated using (public.est_admin());
create policy "admin lit tout le journal" on public.journal_usage
  for select to authenticated using (public.est_admin());

-- Un formateur désactivé ne peut plus lancer de session.
create or replace function public.lancer_session(
  p_quiz uuid, p_mode_tables boolean default false, p_noms_tables text[] default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  qz  public.quiz;
  s   public.sessions;
begin
  select * into qz from public.quiz where id = p_quiz and formateur_id = auth.uid() and public.est_formateur();
  if not found then
    raise exception 'Ce quiz est introuvable.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.questions where quiz_id = qz.id) then
    raise exception 'Ajoute au moins une question avant de lancer le quiz.' using errcode = '22023';
  end if;
  if p_mode_tables and coalesce(array_length(p_noms_tables, 1), 0) < 2 then
    raise exception 'Le mode « par table » demande au moins deux tables.' using errcode = '22023';
  end if;

  insert into public.sessions (formateur_id, quiz_id, titre, code, mode_tables, celebrations)
  values (auth.uid(), qz.id, qz.titre, public.generer_code(), p_mode_tables, qz.celebrations)
  returning * into s;

  insert into public.questions_session
    (session_id, ordre, type, enonce, choix, bonne_reponse, bonnes_reponses, annoncer_nombre,
     libelle_min, libelle_max, duree_secondes, explication)
  select s.id, row_number() over (order by ordre), type, enonce, choix, bonne_reponse, bonnes_reponses,
         annoncer_nombre, libelle_min, libelle_max, duree_secondes, explication
  from public.questions where quiz_id = qz.id;

  if p_mode_tables then
    insert into public.tables_salle (session_id, nom, ordre)
    select s.id, trim(nom), ord from unnest(p_noms_tables) with ordinality as t(nom, ord);
  end if;

  return jsonb_build_object('session_id', s.id, 'code', s.code);
end $$;

-- ----------------------------------------------------------------------------
-- Gestion des formateurs (admin uniquement)
-- ----------------------------------------------------------------------------
create or replace function public.admin_liste_formateurs()
returns table (id uuid, email text, est_admin boolean, actif boolean, nb_quiz bigint, derniere_session timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Réservé aux administrateurs.' using errcode = '42501';
  end if;
  return query
    select f.id, f.email, f.est_admin, f.actif,
           (select count(*) from public.quiz z where z.formateur_id = f.id),
           (select max(j.cree_le) from public.journal_usage j where j.formateur_id = f.id and j.type = 'session')
    from public.formateurs f
    order by f.actif desc, f.email;
end $$;

create or replace function public.admin_ajouter_formateur(p_email text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  u auth.users;
begin
  if not public.est_admin() then
    raise exception 'Réservé aux administrateurs.' using errcode = '42501';
  end if;
  select * into u from auth.users
  where lower(email) = lower(trim(p_email)) and not coalesce(is_anonymous, false)
  limit 1;
  if not found then
    raise exception 'Cette personne doit d''abord se connecter une fois sur la page de connexion formateur, puis tu pourras l''ajouter.'
      using errcode = 'P0002';
  end if;
  insert into public.formateurs (id, email) values (u.id, u.email)
  on conflict (id) do update set actif = true;
end $$;

create or replace function public.admin_modifier_formateur(p_formateur uuid, p_actif boolean, p_est_admin boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Réservé aux administrateurs.' using errcode = '42501';
  end if;
  if p_formateur = auth.uid() and (not p_actif or not p_est_admin) then
    raise exception 'Tu ne peux pas te retirer toi-même tes droits.' using errcode = '42501';
  end if;
  update public.formateurs set actif = p_actif, est_admin = p_est_admin where id = p_formateur;
  if not found then
    raise exception 'Ce formateur est introuvable.' using errcode = 'P0002';
  end if;
end $$;

revoke execute on function public.admin_liste_formateurs(), public.admin_ajouter_formateur(text),
  public.admin_modifier_formateur(uuid, boolean, boolean) from public, anon;
grant execute on function public.admin_liste_formateurs(), public.admin_ajouter_formateur(text),
  public.admin_modifier_formateur(uuid, boolean, boolean) to authenticated;
