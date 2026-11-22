-- =============================================================================
-- Vue explicite « participant » : un formateur connecté qui rejoint aussi son
-- propre quiz comme participant (test sur le même navigateur) doit voir l'écran
-- d'un participant (sa réponse, son score), pas celui du formateur.
-- Le téléphone appelle etat_session(p_session, 'participant').
-- La vue participant n'ouvre aucun droit : elle exige une fiche participant.
-- =============================================================================
drop function public.etat_session(uuid);
drop function public.resultats_question(uuid);

create function public.resultats_question(p_question uuid, p_vue text default 'auto')
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

  formateur := public.anime_session(q.session_id) and coalesce(p_vue, 'auto') <> 'participant';
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
  elsif q.type = 'qcm_multiple' then
    detail := jsonb_build_object(
      'bonnes_reponses', to_jsonb(public.indices_tries(q.bonnes_reponses)),
      -- nombre de personnes ayant coché chaque proposition
      'repartition', (select jsonb_agg(coalesce(c.n, 0) order by i.idx)
                      from generate_series(0, array_length(q.choix, 1) - 1) as i(idx)
                      left join (select e::int as idx, count(*)::int n
                                 from public.reponses r, jsonb_array_elements_text(r.valeur) e
                                 where r.question_id = q.id group by 1) c
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
    if q.type = 'qcm_multiple' then
      -- « Presque » : pas exacte, mais rien que de bonnes réponses cochées (au moins une)
      detail := detail || jsonb_build_object(
        'presque', ma.id is not null
                   and not coalesce(ma.est_correcte, false)
                   and public.indices_tries(ma.valeur) <@ public.indices_tries(q.bonnes_reponses));
    end if;
  end if;
  return detail;
end $$;

create function public.etat_session(p_session uuid, p_vue text default 'auto')
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
  formateur := public.anime_session(s.id) and coalesce(p_vue, 'auto') <> 'participant';
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
        'choix',          to_jsonb(q.choix),     -- jamais bonne_reponse ni bonnes_reponses ici
        -- Nombre de bonnes réponses, seulement si le formateur choisit de l'annoncer
        'nb_bonnes',      case when q.type = 'qcm_multiple' and q.annoncer_nombre
                               then cardinality(q.bonnes_reponses) end,
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
        'resultats', public.resultats_question(q.id, p_vue),
        -- Moment de célébration prévu par le formateur après cette question (sinon null)
        'celebration', (select c->>'message' from jsonb_array_elements(s.celebrations) c
                        where (c->>'apres_question')::int = q.ordre limit 1));
    end if;
  end if;

  if s.etat in ('bilan', 'terminee') then
    resultat := resultat || jsonb_build_object('bilan', public.bilan_session(s.id));
    -- Score PERSONNEL : uniquement pour le participant lui-même (jamais le formateur,
    -- jamais celui d'un autre : il est calculé ici à partir de `moi`, sans fonction dédiée).
    if not formateur then
      resultat := resultat || jsonb_build_object('mon_score', jsonb_build_object(
        'questions_posees', (select count(*) from public.questions_session
                             where session_id = s.id and ouverte_le is not null),
        'reponses_donnees', (select count(*) from public.reponses where participant_id = moi.id),
        'qcm_poses',        (select count(*) from public.questions_session
                             where session_id = s.id and type in ('qcm', 'qcm_multiple') and fermee_le is not null),
        'qcm_justes',       (select count(*) from public.reponses r
                             join public.questions_session qq on qq.id = r.question_id
                             where r.participant_id = moi.id and qq.type in ('qcm', 'qcm_multiple')
                               and r.est_correcte),
        'qcm_presque',      (select count(*) from public.reponses r
                             join public.questions_session qq on qq.id = r.question_id
                             where r.participant_id = moi.id and qq.type = 'qcm_multiple'
                               and not coalesce(r.est_correcte, false)
                               and public.indices_tries(r.valeur) <@ public.indices_tries(qq.bonnes_reponses)),
        'contribution',     (select count(*) + count(*) filter (where est_correcte)
                             from public.reponses where participant_id = moi.id)));
    end if;
  end if;

  return resultat;
end $$;

revoke execute on function public.etat_session(uuid, text), public.resultats_question(uuid, text) from public, anon;
grant execute on function public.etat_session(uuid, text), public.resultats_question(uuid, text) to authenticated;
