-- =============================================================================
-- Moments de célébration définis par quiz (remplace les paliers en pourcentage,
-- à la demande de JF) : « après la question N, afficher tel message ».
-- Format : [{"apres_question": 3, "message": "…"}], 0 à 10 éléments,
-- positions uniques ≥ 1, message de 1 à 140 caractères.
-- =============================================================================
alter table public.quiz drop constraint quiz_paliers_valides;
alter table public.quiz drop column paliers;
drop function public.paliers_valides(numeric[]);

create or replace function public.celebrations_valides(c jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(c) = 'array'
     and jsonb_array_length(c) <= 10
     and not exists (
       select 1 from jsonb_array_elements(c) e
       where jsonb_typeof(e) <> 'object'
          or jsonb_typeof(e->'apres_question') <> 'number'
          or (e->>'apres_question')::numeric <> floor((e->>'apres_question')::numeric)
          or (e->>'apres_question')::numeric < 1
          or jsonb_typeof(e->'message') <> 'string'
          or char_length(btrim(e->>'message')) not between 1 and 140)
     and (select count(distinct e->>'apres_question') from jsonb_array_elements(c) e) = jsonb_array_length(c);
$$;
grant execute on function public.celebrations_valides(jsonb) to authenticated;

alter table public.quiz
  add column celebrations jsonb not null default '[]'
  constraint quiz_celebrations_valides check (public.celebrations_valides(celebrations));
alter table public.sessions
  add column celebrations jsonb not null default '[]';

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

  insert into public.sessions (formateur_id, quiz_id, titre, code, mode_tables, celebrations)
  values (auth.uid(), qz.id, qz.titre, public.generer_code(), p_mode_tables, qz.celebrations)
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

create or replace function public.etat_session(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s          public.sessions;
  q          public.questions_session;
  formateur  boolean;
  moi        public.participants;
  resultat   jsonb;
begin
  select * into s from public.sessions where id = p_session;
  if not found then
    raise exception 'Ce quiz n''existe plus.' using errcode = 'P0002';
  end if;
  formateur := public.anime_session(s.id);
  if not formateur then
    select * into moi from public.participants where session_id = s.id and utilisateur_id = auth.uid();
    if not found then
      raise exception 'Tu ne participes pas à ce quiz. Rejoins-le avec son code.' using errcode = '42501';
    end if;
  end if;

  resultat := jsonb_build_object(
    'maintenant',      now(),               -- pour caler l'horloge du téléphone
    'session_id',      s.id,
    'titre',           s.titre,
    'code',            s.code,
    'etat',            s.etat,
    'mode_tables',     s.mode_tables,
    'nb_questions',    (select count(*) from public.questions_session where session_id = s.id),
    'nb_participants', (select count(*) from public.participants where session_id = s.id),
    'jauge',           public.jauge_session(s.id)
  );

  if not formateur then
    resultat := resultat || jsonb_build_object(
      'moi', jsonb_build_object('participant_id', moi.id, 'pseudo', moi.pseudo, 'table_id', moi.table_id));
  end if;

  if s.question_courante_id is not null then
    select * into q from public.questions_session where id = s.question_courante_id;
    resultat := resultat || jsonb_build_object(
      'question', jsonb_build_object(
        'id',             q.id,
        'ordre',          q.ordre,
        'type',           q.type,
        'enonce',         q.enonce,
        'choix',          to_jsonb(q.choix),     -- jamais bonne_reponse ici
        'libelle_min',    q.libelle_min,
        'libelle_max',    q.libelle_max,
        'duree_secondes', q.duree_secondes,
        'ouverte_le',     q.ouverte_le,
        'fin_reponses_le', s.fin_reponses_le,
        'nb_reponses',    (select count(*) from public.reponses where question_id = q.id)
      ));
    if not formateur then
      resultat := resultat || jsonb_build_object(
        'a_repondu', exists (select 1 from public.reponses where question_id = q.id and participant_id = moi.id));
    end if;
    if s.etat = 'resultats' then
      resultat := resultat || jsonb_build_object(
        'resultats', public.resultats_question(q.id),
        -- Moment de célébration prévu par le formateur après cette question (sinon null)
        'celebration', (select c->>'message' from jsonb_array_elements(s.celebrations) c
                        where (c->>'apres_question')::int = q.ordre limit 1));
    end if;
  end if;

  if s.etat in ('bilan', 'terminee') then
    resultat := resultat || jsonb_build_object('bilan', public.bilan_session(s.id));
  end if;

  return resultat;
end $$;
