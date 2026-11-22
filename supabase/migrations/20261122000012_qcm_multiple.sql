-- =============================================================================
-- QCM à plusieurs bonnes réponses (type `qcm_multiple`)
-- =============================================================================
-- * `bonnes_reponses` (indices 0-based) est SECRET comme `bonne_reponse` :
--   questions_session n'est lisible que par le formateur, etat_session ne
--   renvoie jamais les indices (seulement `nb_bonnes` si le formateur l'annonce),
--   resultats_question ne les révèle qu'après la fermeture de la question.
-- * Une réponse de participant est un tableau JSON d'indices distincts, stocké trié.
-- * Bonne réponse = ensemble choisi identique à l'ensemble des bonnes réponses.
-- =============================================================================

alter table public.questions
  add column bonnes_reponses  smallint[],
  add column annoncer_nombre  boolean not null default true;
alter table public.questions_session
  add column bonnes_reponses  smallint[],          -- SECRET tant que la question n'est pas fermée
  add column annoncer_nombre  boolean not null default true;

-- -----------------------------------------------------------------------------
-- Fonctions utilitaires (internes, non exposées sauf la première, que la
-- contrainte CHECK exécute avec les droits de l'appelant)
-- -----------------------------------------------------------------------------
-- Au moins 2 indices distincts, chacun 0 <= i < nb_choix.
create or replace function public.bonnes_reponses_valides(p smallint[], nb_choix int)
returns boolean language sql immutable set search_path = '' as $$
  select p is not null and nb_choix is not null
     and array_ndims(p) = 1
     and cardinality(p) >= 2
     and not exists (select 1 from unnest(p) v where v is null or v < 0 or v >= nb_choix)
     and (select count(distinct v) from unnest(p) v) = cardinality(p);
$$;

-- Indices triés par ordre croissant (réponse stockée, ou bonnes réponses).
create or replace function public.indices_tries(p jsonb)
returns int[] language sql immutable set search_path = '' as $$
  select coalesce(array(select e::int from jsonb_array_elements_text(p) e order by 1), '{}');
$$;
create or replace function public.indices_tries(p smallint[])
returns int[] language sql immutable set search_path = '' as $$
  select coalesce(array(select v::int from unnest(p) v order by 1), '{}');
$$;

revoke execute on function public.bonnes_reponses_valides(smallint[], int),
                           public.indices_tries(jsonb),
                           public.indices_tries(smallint[]) from public, anon;
grant execute on function public.bonnes_reponses_valides(smallint[], int) to authenticated;

-- -----------------------------------------------------------------------------
-- Contrainte de cohérence des questions (même nom qu'avant, définition étendue)
-- -----------------------------------------------------------------------------
alter table public.questions drop constraint qcm_coherent;
alter table public.questions add constraint qcm_coherent check (
  (type = 'qcm'
     and choix is not null
     and array_length(choix, 1) between 2 and 6
     and bonne_reponse is not null
     and bonne_reponse >= 0 and bonne_reponse < array_length(choix, 1))
  or (type = 'qcm_multiple'
     and choix is not null
     and array_length(choix, 1) between 2 and 6
     and bonne_reponse is null
     and public.bonnes_reponses_valides(bonnes_reponses, array_length(choix, 1)))
  or (type not in ('qcm', 'qcm_multiple')
     and choix is null and bonne_reponse is null and bonnes_reponses is null)
);

-- -----------------------------------------------------------------------------
-- Jauge : un QCM multiple pèse comme un QCM (1 pour avoir répondu + 1 si exact)
-- -----------------------------------------------------------------------------
create or replace function public.poids_max_question(p_type public.type_question)
returns int language sql immutable set search_path = '' as $$
  select case when p_type in ('qcm', 'qcm_multiple') then 2 else 1 end;
$$;

-- -----------------------------------------------------------------------------
-- lancer_session : copie aussi bonnes_reponses et annoncer_nombre
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- etat_session : ajoute `nb_bonnes` à la question (jamais les indices)
-- -----------------------------------------------------------------------------
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
        'resultats', public.resultats_question(q.id),
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

-- -----------------------------------------------------------------------------
-- repondre : valide aussi les réponses à un QCM multiple
-- -----------------------------------------------------------------------------
create or replace function public.repondre(p_question uuid, p_valeur jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  q       public.questions_session;
  s       public.sessions;
  moi     public.participants;
  valeur  jsonb;
  texte   text;
  nombre  int;
  indices int[];
  nb_choix int;
begin
  select * into q from public.questions_session where id = p_question;
  if not found then
    raise exception 'Cette question n''existe plus.' using errcode = 'P0002';
  end if;
  select * into s from public.sessions where id = q.session_id;
  select * into moi from public.participants where session_id = s.id and utilisateur_id = auth.uid();
  if not found then
    raise exception 'Tu ne participes pas à ce quiz. Rejoins-le avec son code.' using errcode = '42501';
  end if;

  -- 2 secondes de tolérance pour la latence du wifi
  if s.etat <> 'question' or s.question_courante_id <> q.id
     or now() > s.fin_reponses_le + interval '2 seconds' then
    raise exception 'Le temps est écoulé pour cette question.' using errcode = '55000';
  end if;

  -- Validation selon le type
  case q.type
    when 'qcm', 'echelle' then
      begin
        nombre := (p_valeur #>> '{}')::int;
      exception when others then
        raise exception 'Réponse invalide. Touche une des propositions.' using errcode = '22023';
      end;
      if (q.type = 'qcm' and (nombre < 0 or nombre >= array_length(q.choix, 1)))
         or (q.type = 'echelle' and (nombre < 1 or nombre > 5)) then
        raise exception 'Réponse invalide. Touche une des propositions.' using errcode = '22023';
      end if;
      valeur := to_jsonb(nombre);
    when 'qcm_multiple' then
      nb_choix := array_length(q.choix, 1);
      -- Un tableau d'entiers, pas plus long que le nombre de propositions
      if jsonb_typeof(p_valeur) is distinct from 'array'
         or jsonb_array_length(p_valeur) > nb_choix
         or exists (select 1 from jsonb_array_elements(p_valeur) e where jsonb_typeof(e) <> 'number') then
        raise exception 'Réponse invalide. Touche une ou plusieurs propositions.' using errcode = '22023';
      end if;
      if jsonb_array_length(p_valeur) = 0 then
        raise exception 'Choisis au moins une réponse.' using errcode = '22023';
      end if;
      begin
        indices := public.indices_tries(p_valeur);
      exception when others then
        raise exception 'Réponse invalide. Touche une ou plusieurs propositions.' using errcode = '22023';
      end;
      if indices[1] < 0 or indices[cardinality(indices)] >= nb_choix then
        raise exception 'Réponse invalide. Touche une ou plusieurs propositions.' using errcode = '22023';
      end if;
      if (select count(distinct i) from unnest(indices) i) <> cardinality(indices) then
        raise exception 'Choisis chaque proposition une seule fois.' using errcode = '22023';
      end if;
      if q.annoncer_nombre and cardinality(indices) <> cardinality(q.bonnes_reponses) then
        raise exception 'Choisis exactement % réponses.', cardinality(q.bonnes_reponses)
          using errcode = '22023';
      end if;
      valeur := to_jsonb(indices);     -- trié par ordre croissant
    when 'nuage' then
      texte := lower(regexp_replace(trim(coalesce(p_valeur #>> '{}', '')), '\s+', ' ', 'g'));
      if char_length(texte) < 1 or char_length(texte) > 30 then
        raise exception 'Écris un mot ou une courte expression (30 caractères maximum).' using errcode = '22023';
      end if;
      valeur := to_jsonb(texte);
    when 'ouverte' then
      texte := trim(coalesce(p_valeur #>> '{}', ''));
      if char_length(texte) < 1 or char_length(texte) > 280 then
        raise exception 'Ta réponse doit faire entre 1 et 280 caractères.' using errcode = '22023';
      end if;
      valeur := to_jsonb(texte);
  end case;

  begin
    insert into public.reponses (session_id, question_id, participant_id, valeur, temps_ms)
    values (s.id, q.id, moi.id, valeur,
            greatest(0, (extract(epoch from (now() - q.ouverte_le)) * 1000)::int));
  exception when unique_violation then
    raise exception 'Tu as déjà répondu à cette question.' using errcode = '23505';
  end;

  return jsonb_build_object('enregistree', true);
end $$;

-- -----------------------------------------------------------------------------
-- fermer_question : correction du QCM multiple (ensemble choisi = ensemble des bonnes)
-- -----------------------------------------------------------------------------
create or replace function public.fermer_question(p_session uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s  public.sessions := public.verifier_animateur(p_session);
  q  public.questions_session;
begin
  if s.etat <> 'question' then
    return public.etat_session(s.id);  -- idempotent : déjà fermée
  end if;
  select * into q from public.questions_session where id = s.question_courante_id;

  update public.questions_session set fermee_le = now() where id = q.id;
  if q.type = 'qcm' then
    update public.reponses
       set est_correcte = ((valeur #>> '{}')::int = q.bonne_reponse)
     where question_id = q.id;
  elsif q.type = 'qcm_multiple' then
    update public.reponses
       set est_correcte = (public.indices_tries(valeur) = public.indices_tries(q.bonnes_reponses))
     where question_id = q.id;
  end if;
  update public.sessions
     set etat = 'resultats', fin_reponses_le = least(fin_reponses_le, now())
   where id = s.id;
  return public.etat_session(s.id);
end $$;

-- -----------------------------------------------------------------------------
-- resultats_question : ajoute le détail du QCM multiple
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Mentions : « plus belle progression » prend les QCM et les QCM multiples
-- -----------------------------------------------------------------------------
create or replace function public.calculer_mentions(p_session uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  nb_posees int;
begin
  select count(*) into nb_posees from public.questions_session
  where session_id = p_session and ouverte_le is not null;

  -- « A répondu à tout »
  if nb_posees > 0 then
    insert into public.mentions (session_id, participant_id, type)
    select p_session, r.participant_id, 'a_repondu_a_tout'
    from public.reponses r where r.session_id = p_session
    group by r.participant_id having count(*) = nb_posees
    on conflict do nothing;
  end if;

  -- « Plus belle progression » : taux de réussite QCM (simples et multiples)
  -- 2e moitié − 1re moitié. Seulement s'il y a au moins 4 QCM posés et une
  -- progression réelle.
  with qcm as (
    select id, ntile(2) over (order by ordre) moitie
    from public.questions_session
    where session_id = p_session and type in ('qcm', 'qcm_multiple') and fermee_le is not null
  ),
  taux as (
    select r.participant_id,
           avg(case when r.est_correcte then 1.0 else 0 end) filter (where qcm.moitie = 1) t1,
           avg(case when r.est_correcte then 1.0 else 0 end) filter (where qcm.moitie = 2) t2
    from public.reponses r join qcm on qcm.id = r.question_id
    group by r.participant_id
  ),
  progres as (
    select participant_id, t2 - t1 delta from taux where t1 is not null and t2 is not null
  )
  insert into public.mentions (session_id, participant_id, type)
  select p_session, participant_id, 'plus_belle_progression'
  from progres
  where (select count(*) from qcm) >= 4
    and delta > 0
    and delta = (select max(delta) from progres)
  on conflict do nothing;
end $$;

-- -----------------------------------------------------------------------------
-- Bilan : taux de réussite QCM sur les QCM simples et multiples
-- -----------------------------------------------------------------------------
create or replace function public.bilan_session(p_session uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'jauge',           public.jauge_session(p_session),
    'nb_participants', (select count(*) from public.participants where session_id = p_session),
    'nb_reponses',     (select count(*) from public.reponses where session_id = p_session),
    'taux_reussite_qcm', (select round(100.0 * count(*) filter (where r.est_correcte) / nullif(count(*), 0))
                          from public.reponses r
                          join public.questions_session q on q.id = r.question_id
                          where r.session_id = p_session and q.type in ('qcm', 'qcm_multiple')),
    'nuage', coalesce((select jsonb_agg(jsonb_build_object('mot', mot, 'nombre', n) order by n desc, mot)
                       from (select r.valeur #>> '{}' mot, count(*)::int n
                             from public.reponses r
                             join public.questions_session q on q.id = r.question_id
                             where r.session_id = p_session and q.type = 'nuage' and not r.masquee
                             group by 1 order by 2 desc, 1 limit 60) m), '[]'::jsonb),
    'mentions', coalesce((select jsonb_agg(jsonb_build_object(
                            'type', m.type,
                            'pseudo', p.pseudo,
                            'texte', case when m.type = 'coup_de_coeur' then r.valeur #>> '{}' end)
                          order by m.type, p.pseudo)
                          from public.mentions m
                          join public.participants p on p.id = m.participant_id
                          left join public.reponses r on r.id = m.reponse_id
                          where m.session_id = p_session), '[]'::jsonb)
  );
$$;

-- -----------------------------------------------------------------------------
-- Export CSV : pour un QCM multiple, libellés cochés joints par « ; »
-- -----------------------------------------------------------------------------
create or replace function public.export_session(p_session uuid)
returns table (
  question_ordre int, question_type public.type_question, question text,
  pseudo text, table_nom text, reponse text, est_correcte boolean, temps_secondes numeric,
  repondu_le timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.verifier_animateur(p_session);
  return query
    select q.ordre, q.type, q.enonce, p.pseudo, t.nom,
           case when q.type = 'qcm' then q.choix[(r.valeur #>> '{}')::int + 1]
                when q.type = 'qcm_multiple'
                  then (select string_agg(q.choix[i + 1], ' ; ' order by i)
                        from unnest(public.indices_tries(r.valeur)) as u(i))
                else r.valeur #>> '{}' end,
           r.est_correcte, round(r.temps_ms / 1000.0, 1), r.cree_le
    from public.reponses r
    join public.questions_session q on q.id = r.question_id
    join public.participants p on p.id = r.participant_id
    left join public.tables_salle t on t.id = p.table_id
    where r.session_id = p_session
    order by q.ordre, p.pseudo;
end $$;
