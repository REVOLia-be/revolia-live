-- =============================================================================
-- Paliers de la jauge collective réglables par quiz (fractions du maximum,
-- de 1 à 5 paliers, strictement croissants, entre 5 % et 100 %).
-- La session en reçoit une copie au lancement.
-- =============================================================================
create or replace function public.paliers_valides(p numeric[])
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(array_length(p, 1), 0) between 1 and 5
     and not exists (select 1 from unnest(p) v where v < 0.05 or v > 1)
     and not exists (select 1 from generate_subscripts(p, 1) i where i > 1 and p[i] <= p[i - 1]);
$$;

alter table public.quiz
  add column paliers numeric[] not null default '{0.4,0.65,0.85}'
  constraint quiz_paliers_valides check (public.paliers_valides(paliers));

create or replace function public.lancer_session(
  p_quiz uuid, p_mode_tables boolean default false, p_noms_tables text[] default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  qz  public.quiz;
  s   public.sessions;
begin
  select * into qz from public.quiz where id = p_quiz and formateur_id = auth.uid();
  if not found then
    raise exception 'Ce quiz est introuvable.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.questions where quiz_id = qz.id) then
    raise exception 'Ajoute au moins une question avant de lancer le quiz.' using errcode = '22023';
  end if;
  if p_mode_tables and coalesce(array_length(p_noms_tables, 1), 0) < 2 then
    raise exception 'Le mode « par table » demande au moins deux tables.' using errcode = '22023';
  end if;

  insert into public.sessions (formateur_id, quiz_id, titre, code, mode_tables, paliers)
  values (auth.uid(), qz.id, qz.titre, public.generer_code(), p_mode_tables, qz.paliers)
  returning * into s;

  insert into public.questions_session
    (session_id, ordre, type, enonce, choix, bonne_reponse, libelle_min, libelle_max, duree_secondes, explication)
  select s.id, row_number() over (order by ordre), type, enonce, choix, bonne_reponse,
         libelle_min, libelle_max, duree_secondes, explication
  from public.questions where quiz_id = qz.id;

  if p_mode_tables then
    insert into public.tables_salle (session_id, nom, ordre)
    select s.id, trim(nom), ord from unnest(p_noms_tables) with ordinality as t(nom, ord);
  end if;

  return jsonb_build_object('session_id', s.id, 'code', s.code);
end $$;

grant execute on function public.paliers_valides(numeric[]) to authenticated;
