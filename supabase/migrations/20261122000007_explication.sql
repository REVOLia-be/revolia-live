-- =============================================================================
-- Bloc « Pourquoi ? » : une explication facultative (2-3 phrases) par question,
-- copiée dans la session au lancement et révélée avec les résultats, c'est-à-dire
-- seulement APRÈS la fermeture de la question (comme la bonne réponse).
-- =============================================================================
alter table public.questions
  add column explication text check (char_length(explication) <= 500);
alter table public.questions_session
  add column explication text;

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

  insert into public.sessions (formateur_id, quiz_id, titre, code, mode_tables)
  values (auth.uid(), qz.id, qz.titre, public.generer_code(), p_mode_tables)
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

create or replace function public.resultats_question(p_question uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  q          public.questions_session;
  formateur  boolean;
  moi        public.participants;
  ma         public.reponses;
  detail     jsonb;
begin
  select * into q from public.questions_session where id = p_question;
  if not found then return null; end if;

  formateur := public.anime_session(q.session_id);
  if not formateur and not public.participe_a(q.session_id) then
    raise exception 'Tu ne participes pas à ce quiz.' using errcode = '42501';
  end if;
  if q.fermee_le is null then
    raise exception 'Les résultats seront visibles à la fin de la question.' using errcode = '55000';
  end if;

  if q.type = 'qcm' then
    detail := jsonb_build_object(
      'bonne_reponse', q.bonne_reponse,
      'repartition', (select jsonb_agg(coalesce(c.n, 0) order by i.idx)
                      from generate_series(0, array_length(q.choix, 1) - 1) as i(idx)
                      left join (select (valeur #>> '{}')::int as idx, count(*)::int n
                                 from public.reponses where question_id = q.id group by 1) c
                        on c.idx = i.idx),
      'taux_reussite', (select round(100.0 * count(*) filter (where est_correcte) / nullif(count(*), 0))
                        from public.reponses where question_id = q.id)
    );
  elsif q.type = 'echelle' then
    detail := jsonb_build_object(
      'repartition', (select jsonb_agg(coalesce(c.n, 0) order by v.val)
                      from generate_series(1, 5) as v(val)
                      left join (select (valeur #>> '{}')::int as val, count(*)::int n
                                 from public.reponses where question_id = q.id group by 1) c
                        on c.val = v.val),
      'moyenne', (select round(avg((valeur #>> '{}')::numeric), 1)
                  from public.reponses where question_id = q.id)
    );
  elsif q.type = 'nuage' then
    detail := jsonb_build_object(
      'mots', coalesce((select jsonb_agg(jsonb_build_object('mot', mot, 'nombre', n) order by n desc, mot)
                        from (select valeur #>> '{}' as mot, count(*)::int n
                              from public.reponses where question_id = q.id and not masquee
                              group by 1 order by 2 desc, 1 limit 60) m), '[]'::jsonb)
    );
  else -- ouverte : textes sans pseudo (anonymat à l'écran)
    detail := jsonb_build_object(
      'reponses', coalesce((select jsonb_agg(jsonb_build_object(
                              'id', r.id,
                              'texte', r.valeur #>> '{}',
                              'coup_de_coeur', exists (select 1 from public.mentions m
                                                       where m.reponse_id = r.id and m.type = 'coup_de_coeur'))
                            order by r.cree_le)
                            from public.reponses r where r.question_id = q.id and not r.masquee), '[]'::jsonb)
    );
  end if;

  detail := detail || jsonb_build_object(
    'question_id', q.id,
    'explication', q.explication,
    'nb_reponses', (select count(*) from public.reponses where question_id = q.id)
  );

  if not formateur then
    select * into moi from public.participants where session_id = q.session_id and utilisateur_id = auth.uid();
    select * into ma from public.reponses where question_id = q.id and participant_id = moi.id;
    detail := detail || jsonb_build_object(
      'ma_reponse',   case when ma.id is null then null else ma.valeur end,
      'est_correcte', ma.est_correcte,
      'ma_contribution', case when ma.id is null then 0
                              else 1 + case when ma.est_correcte then 1 else 0 end end
    );
  end if;
  return detail;
end $$;
