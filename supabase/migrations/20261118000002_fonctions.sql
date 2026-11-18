-- =============================================================================
-- REVOLia Live — fonctions serveur (RPC)
-- =============================================================================
-- Toutes les écritures passent par ici. Chaque fonction vérifie qui appelle.
-- Les messages d'erreur sont en français et s'adressent à l'utilisateur final :
-- le client peut les afficher tels quels (champ `message` de l'erreur).
-- =============================================================================

-- Poids d'une réponse dans la jauge collective : 1 point pour avoir répondu,
-- +1 pour une bonne réponse à un QCM.
create or replace function public.poids_max_question(p_type public.type_question)
returns int language sql immutable as $$
  select case when p_type = 'qcm' then 2 else 1 end;
$$;

-- -----------------------------------------------------------------------------
-- PARTICIPANT : avant de rejoindre
-- -----------------------------------------------------------------------------
create or replace function public.infos_session(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s public.sessions;
begin
  select * into s from public.sessions
  where code = upper(trim(p_code)) and etat <> 'terminee';
  if not found then
    raise exception 'Aucun quiz en cours avec ce code. Vérifie les lettres affichées à l''écran.'
      using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'session_id',  s.id,
    'titre',       s.titre,
    'mode_tables', s.mode_tables,
    'tables', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'nom', t.nom) order by t.ordre)
                        from public.tables_salle t where t.session_id = s.id), '[]'::jsonb)
  );
end $$;

-- Rejoindre (ou revenir après une coupure : même téléphone = même participant).
create or replace function public.rejoindre_session(p_code text, p_pseudo text, p_table_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s       public.sessions;
  p       public.participants;
  v_pseudo text := regexp_replace(trim(coalesce(p_pseudo, '')), '\s+', ' ', 'g');
begin
  if auth.uid() is null then
    raise exception 'Ta connexion a été interrompue. Recharge la page.' using errcode = '28000';
  end if;

  select * into s from public.sessions
  where code = upper(trim(p_code)) and etat <> 'terminee';
  if not found then
    raise exception 'Aucun quiz en cours avec ce code. Vérifie les lettres affichées à l''écran.'
      using errcode = 'P0002';
  end if;

  if char_length(v_pseudo) < 1 or char_length(v_pseudo) > 20 then
    raise exception 'Choisis un pseudo de 1 à 20 caractères.' using errcode = '22023';
  end if;

  if s.mode_tables then
    if p_table_id is null or not exists (select 1 from public.tables_salle
                                         where id = p_table_id and session_id = s.id) then
      raise exception 'Choisis ta table pour continuer.' using errcode = '22023';
    end if;
  else
    p_table_id := null;
  end if;

  -- Déjà inscrit depuis ce téléphone ? On met à jour et on renvoie la même fiche.
  select * into p from public.participants where session_id = s.id and utilisateur_id = auth.uid();
  begin
    if found then
      update public.participants set pseudo = v_pseudo, table_id = p_table_id
      where id = p.id returning * into p;
    else
      insert into public.participants (session_id, utilisateur_id, pseudo, table_id)
      values (s.id, auth.uid(), v_pseudo, p_table_id) returning * into p;
    end if;
  exception when unique_violation then
    raise exception 'Ce pseudo est déjà pris dans la salle. Ajoute une initiale ou un chiffre.'
      using errcode = '23505';
  end;

  return jsonb_build_object('session_id', s.id, 'participant_id', p.id, 'pseudo', p.pseudo);
end $$;

-- -----------------------------------------------------------------------------
-- Jauge collective
-- -----------------------------------------------------------------------------
create or replace function public.jauge_session(p_session uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with
    nb as (select count(*)::int n from public.participants where session_id = p_session),
    poids as (select coalesce(sum(public.poids_max_question(type)), 0)::int total
              from public.questions_session where session_id = p_session),
    pts as (select (count(*) + count(*) filter (where est_correcte))::int points
            from public.reponses where session_id = p_session)
  select jsonb_build_object(
    'points',   pts.points,
    'maximum',  nb.n * poids.total,
    'paliers',  to_jsonb(s.paliers),
    'paliers_atteints', (select count(*) from unnest(s.paliers) pal
                         where nb.n * poids.total > 0 and pts.points >= pal * nb.n * poids.total)
  )
  from nb, poids, pts, public.sessions s where s.id = p_session;
$$;

-- -----------------------------------------------------------------------------
-- Résultats d'une question (uniquement une fois fermée)
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

-- -----------------------------------------------------------------------------
-- État complet de la session : appelé au chargement, à chaque changement
-- reçu en temps réel, et à chaque reconnexion.
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
      resultat := resultat || jsonb_build_object('resultats', public.resultats_question(q.id));
    end if;
  end if;

  if s.etat in ('bilan', 'terminee') then
    resultat := resultat || jsonb_build_object('bilan', public.bilan_session(s.id));
  end if;

  return resultat;
end $$;

-- -----------------------------------------------------------------------------
-- PARTICIPANT : répondre
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
-- FORMATEUR : pilotage
-- -----------------------------------------------------------------------------
create or replace function public.verifier_animateur(p_session uuid)
returns public.sessions language plpgsql stable security definer set search_path = '' as $$
declare s public.sessions;
begin
  select * into s from public.sessions where id = p_session and formateur_id = auth.uid();
  if not found then
    raise exception 'Tu n''animes pas cette session.' using errcode = '42501';
  end if;
  return s;
end $$;

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
    (session_id, ordre, type, enonce, choix, bonne_reponse, libelle_min, libelle_max, duree_secondes)
  select s.id, row_number() over (order by ordre), type, enonce, choix, bonne_reponse,
         libelle_min, libelle_max, duree_secondes
  from public.questions where quiz_id = qz.id;

  if p_mode_tables then
    insert into public.tables_salle (session_id, nom, ordre)
    select s.id, trim(nom), ord from unnest(p_noms_tables) with ordinality as t(nom, ord);
  end if;

  return jsonb_build_object('session_id', s.id, 'code', s.code);
end $$;

-- Ouvre la question demandée, ou la suivante non encore posée.
create or replace function public.ouvrir_question(p_session uuid, p_question uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s  public.sessions := public.verifier_animateur(p_session);
  q  public.questions_session;
begin
  if s.etat in ('bilan', 'terminee') then
    raise exception 'Le quiz est terminé.' using errcode = '55000';
  end if;
  if s.etat = 'question' then
    perform public.fermer_question(p_session);
  end if;

  if p_question is null then
    select * into q from public.questions_session
    where session_id = s.id and ouverte_le is null order by ordre limit 1;
    if not found then
      raise exception 'Toutes les questions ont été posées. Passe au bilan.' using errcode = '55000';
    end if;
  else
    select * into q from public.questions_session where id = p_question and session_id = s.id;
    if not found then
      raise exception 'Cette question n''appartient pas à cette session.' using errcode = 'P0002';
    end if;
    if q.ouverte_le is not null then
      raise exception 'Cette question a déjà été posée.' using errcode = '55000';
    end if;
  end if;

  update public.questions_session set ouverte_le = now() where id = q.id;
  update public.sessions
     set etat = 'question',
         question_courante_id = q.id,
         fin_reponses_le = now() + make_interval(secs => q.duree_secondes)
   where id = s.id;
  return public.etat_session(s.id);
end $$;

-- Ferme la question en cours et calcule les bonnes réponses.
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
  end if;
  update public.sessions
     set etat = 'resultats', fin_reponses_le = least(fin_reponses_le, now())
   where id = s.id;
  return public.etat_session(s.id);
end $$;

-- Mentions automatiques, calculées une fois au passage au bilan.
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

  -- « Plus belle progression » : taux de réussite QCM 2e moitié − 1re moitié.
  -- Seulement s'il y a au moins 4 QCM posés et une progression réelle.
  with qcm as (
    select id, ntile(2) over (order by ordre) moitie
    from public.questions_session
    where session_id = p_session and type = 'qcm' and fermee_le is not null
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

create or replace function public.passer_au_bilan(p_session uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.sessions := public.verifier_animateur(p_session);
begin
  if s.etat = 'question' then
    perform public.fermer_question(p_session);
  end if;
  perform public.calculer_mentions(p_session);
  update public.sessions set etat = 'bilan' where id = s.id;
  return public.etat_session(s.id);
end $$;

create or replace function public.terminer_session(p_session uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.sessions := public.verifier_animateur(p_session);
begin
  if s.etat not in ('bilan', 'terminee') then
    perform public.passer_au_bilan(p_session);
  end if;
  update public.sessions set etat = 'terminee', terminee_le = coalesce(terminee_le, now())
  where id = s.id;
  return public.etat_session(s.id);
end $$;

-- Coup de cœur : le formateur distingue une réponse ouverte (ou le retire).
create or replace function public.basculer_coup_de_coeur(p_reponse uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.reponses;
begin
  select * into r from public.reponses where id = p_reponse;
  if not found then
    raise exception 'Cette réponse n''existe plus.' using errcode = 'P0002';
  end if;
  perform public.verifier_animateur(r.session_id);
  if exists (select 1 from public.mentions where reponse_id = r.id and type = 'coup_de_coeur') then
    delete from public.mentions where reponse_id = r.id and type = 'coup_de_coeur';
    return false;
  end if;
  insert into public.mentions (session_id, participant_id, type, reponse_id)
  values (r.session_id, r.participant_id, 'coup_de_coeur', r.id);
  return true;
end $$;

-- Modération : masquer une réponse déplacée (nuage, question ouverte).
create or replace function public.masquer_reponse(p_reponse uuid, p_masquee boolean default true)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.reponses;
begin
  select * into r from public.reponses where id = p_reponse;
  if not found then return; end if;
  perform public.verifier_animateur(r.session_id);
  update public.reponses set masquee = p_masquee where id = r.id;
end $$;

-- Modération : retirer un participant (pseudo déplacé). Ses réponses partent avec lui.
create or replace function public.exclure_participant(p_participant uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  p public.participants;
begin
  select * into p from public.participants where id = p_participant;
  if not found then return; end if;
  perform public.verifier_animateur(p.session_id);
  delete from public.participants where id = p.id;
end $$;

-- -----------------------------------------------------------------------------
-- Bilan de salle
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
                          where r.session_id = p_session and q.type = 'qcm'),
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
-- Export CSV (formateur) : une ligne par réponse
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
                else r.valeur #>> '{}' end,
           r.est_correcte, round(r.temps_ms / 1000.0, 1), r.cree_le
    from public.reponses r
    join public.questions_session q on q.id = r.question_id
    join public.participants p on p.id = r.participant_id
    left join public.tables_salle t on t.id = p.table_id
    where r.session_id = p_session
    order by q.ordre, p.pseudo;
end $$;

-- -----------------------------------------------------------------------------
-- Droits d'exécution : rien pour le public, tout pour les connectés
-- (participants anonymes inclus) ; chaque fonction vérifie elle-même l'appelant.
-- Les fonctions internes ne sont pas exposées.
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;

grant execute on function
  public.infos_session(text),
  public.rejoindre_session(text, text, uuid),
  public.etat_session(uuid),
  public.resultats_question(uuid),
  public.repondre(uuid, jsonb),
  public.lancer_session(uuid, boolean, text[]),
  public.ouvrir_question(uuid, uuid),
  public.fermer_question(uuid),
  public.passer_au_bilan(uuid),
  public.terminer_session(uuid),
  public.basculer_coup_de_coeur(uuid),
  public.masquer_reponse(uuid, boolean),
  public.exclure_participant(uuid),
  public.export_session(uuid)
to authenticated;

-- Utilisées par les politiques RLS
grant execute on function public.est_formateur(), public.anime_session(uuid), public.participe_a(uuid)
  to authenticated;
