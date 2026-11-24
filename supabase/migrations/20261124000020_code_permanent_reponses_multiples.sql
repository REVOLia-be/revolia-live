-- =============================================================================
-- Code permanent par quiz + plusieurs réponses aux questions ouvertes
-- (voir docs/SPEC-CODE-PERMANENT-REPONSES-MULTIPLES.md, sections A et B)
--
-- A. Chaque quiz porte un code permanent (QR code imprimable). Lancer le quiz
--    crée une session qui reprend ce code ; la session précédente est archivée.
-- B. Une question ouverte peut accepter jusqu'à 10 réponses par participant.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A1. Code permanent du quiz
-- -----------------------------------------------------------------------------
alter table public.quiz add column code text;

-- Code court sans caractères ambigus (pas de 0/O, 1/I/L), unique parmi les codes
-- de quiz ET les codes de sessions non terminées. Utilisée comme valeur par défaut
-- de quiz.code. SECURITY DEFINER : la RLS cacherait les quiz des autres formateurs.
create or replace function public.generer_code()
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  resultat text;
begin
  loop
    resultat := '';
    for i in 1..6 loop
      resultat := resultat || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.quiz where code = resultat)
          and not exists (select 1 from public.sessions where code = resultat and etat <> 'terminee');
  end loop;
  return resultat;
end $$;
-- Nécessaire : la valeur par défaut est évaluée avec les droits de celui qui crée le quiz.
grant execute on function public.generer_code() to authenticated;

-- Les quiz existants reçoivent un code (un par un, pour garantir l'unicité).
-- On suspend le déclencheur de date de modification : ce n'est pas une édition.
alter table public.quiz disable trigger quiz_modifie_le;
do $$
declare r record;
begin
  for r in select id from public.quiz where code is null loop
    update public.quiz set code = public.generer_code() where id = r.id;
  end loop;
end $$;
alter table public.quiz enable trigger quiz_modifie_le;

alter table public.quiz
  alter column code set default public.generer_code(),
  alter column code set not null,
  add constraint quiz_code_format check (code ~ '^[A-Z0-9]{4,10}$'),
  add constraint quiz_code_unique unique (code);

-- Normalise (majuscules, espaces retirés) et refuse proprement un code invalide
-- ou déjà pris (par un autre quiz, ou par une session en cours d'un autre quiz).
create or replace function public.verifier_code_quiz()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.code is null then return new; end if;
  new.code := upper(regexp_replace(new.code, '\s', '', 'g'));
  if new.code !~ '^[A-Z0-9]{4,10}$' then
    raise exception 'Le code doit faire de 4 à 10 caractères : des lettres et des chiffres, sans espace ni accent.'
      using errcode = '22023';
  end if;
  if exists (select 1 from public.quiz where code = new.code and id <> new.id)
     or exists (select 1 from public.sessions
                where code = new.code and etat <> 'terminee' and quiz_id is distinct from new.id) then
    raise exception 'Ce code est déjà utilisé par un autre quiz. Choisis-en un autre.'
      using errcode = '23505';
  end if;
  return new;
end $$;
create trigger quiz_verifier_code before insert or update of code on public.quiz
  for each row execute function public.verifier_code_quiz();
revoke execute on function public.verifier_code_quiz() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- A2. Sessions : le code n'est unique que parmi les sessions non terminées
-- -----------------------------------------------------------------------------
alter table public.sessions drop constraint sessions_code_key;
alter table public.sessions drop constraint sessions_code_check;
alter table public.sessions add constraint sessions_code_check check (code ~ '^[A-Z0-9]{4,10}$');
create unique index sessions_code_actif_unique on public.sessions (code) where etat <> 'terminee';

-- -----------------------------------------------------------------------------
-- B1. Colonnes des réponses multiples
-- -----------------------------------------------------------------------------
alter table public.questions
  add column max_reponses smallint not null default 1 check (max_reponses between 1 and 10),
  add constraint questions_max_reponses_coherent check (max_reponses = 1 or type = 'ouverte');
alter table public.questions_session
  add column max_reponses smallint not null default 1 check (max_reponses between 1 and 10),
  add constraint questions_session_max_reponses_coherent check (max_reponses = 1 or type = 'ouverte');

alter table public.reponses
  add column rang smallint not null default 1 check (rang between 1 and 10);
alter table public.reponses drop constraint reponses_question_id_participant_id_key;
alter table public.reponses add constraint reponses_question_participant_rang_key
  unique (question_id, participant_id, rang);

-- -----------------------------------------------------------------------------
-- Clôture d'une session (interne, sans contrôle de l'appelant : les fonctions
-- publiques vérifient avant). Ferme la question en cours, calcule les mentions,
-- passe la session à « terminée ». Sans effet si elle est déjà terminée.
-- -----------------------------------------------------------------------------
create or replace function public.cloturer_session(p_session uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.sessions;
  q public.questions_session;
begin
  select * into s from public.sessions where id = p_session for update;
  if not found or s.etat = 'terminee' then return; end if;

  if s.etat = 'question' then
    select * into q from public.questions_session where id = s.question_courante_id;
    if found then
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
    end if;
  end if;

  if s.etat <> 'bilan' then
    perform public.calculer_mentions(p_session);
  end if;

  update public.sessions
     set etat = 'terminee',
         terminee_le = coalesce(terminee_le, now()),
         fin_reponses_le = least(fin_reponses_le, now()),
         rendu_projete_id = null
   where id = s.id;
end $$;
revoke execute on function public.cloturer_session(uuid) from public, anon, authenticated;

create or replace function public.terminer_session(p_session uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.sessions := public.verifier_animateur(p_session);
begin
  perform public.cloturer_session(s.id);
  return public.etat_session(s.id);
end $$;

-- Alias explicite pour le bouton « Archiver » : le formateur qui anime la session, ou un admin.
create or replace function public.archiver_session(p_session uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.sessions;
begin
  select * into s from public.sessions where id = p_session;
  if not found then
    raise exception 'Cette session n''existe plus.' using errcode = 'P0002';
  end if;
  if not (public.anime_session(s.id) or public.est_admin()) then
    raise exception 'Tu n''animes pas cette session.' using errcode = '42501';
  end if;
  perform public.cloturer_session(s.id);
  if public.anime_session(s.id) then
    return public.etat_session(s.id);
  end if;
  return jsonb_build_object('session_id', s.id, 'etat', 'terminee');
end $$;

-- -----------------------------------------------------------------------------
-- A3. lancer_session : la session prend le code du quiz ; l'ancienne est archivée
-- -----------------------------------------------------------------------------
create or replace function public.lancer_session(
  p_quiz uuid, p_mode_tables boolean default false, p_noms_tables text[] default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  qz  public.quiz;
  s   public.sessions;
  vide text;
  ancienne uuid;
begin
  select * into qz from public.quiz where id = p_quiz and formateur_id = auth.uid() and public.est_formateur();
  if not found then
    raise exception 'Ce quiz est introuvable.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.questions where quiz_id = qz.id) then
    raise exception 'Ajoute au moins une question avant de lancer le quiz.' using errcode = '22023';
  end if;
  select q.enonce into vide from public.questions q
  where q.quiz_id = qz.id and q.type = 'atelier'
    and not exists (select 1 from public.etapes_atelier e where e.question_id = q.id)
  order by q.ordre limit 1;
  if found then
    raise exception 'L''atelier « % » n''a aucune étape. Ajoute-en au moins une avant de lancer le quiz.', vide
      using errcode = '22023';
  end if;
  if p_mode_tables and coalesce(array_length(p_noms_tables, 1), 0) < 2 then
    raise exception 'Le mode « par table » demande au moins deux tables.' using errcode = '22023';
  end if;

  -- Une seule session non terminée par code : on archive celles de ce quiz
  for ancienne in select id from public.sessions where quiz_id = qz.id and etat <> 'terminee' loop
    perform public.cloturer_session(ancienne);
  end loop;

  -- Une session en cours d'un AUTRE quiz (ancien code) occuperait encore ce code
  if exists (select 1 from public.sessions where code = qz.code and etat <> 'terminee') then
    raise exception 'Une session en cours utilise encore le code de ce quiz. Change le code du quiz, ou attends la fin de cette session.'
      using errcode = '23505';
  end if;

  insert into public.sessions (formateur_id, quiz_id, titre, code, mode_tables, celebrations)
  values (auth.uid(), qz.id, qz.titre, qz.code, p_mode_tables, qz.celebrations)
  returning * into s;

  insert into public.questions_session
    (session_id, ordre, type, enonce, choix, bonne_reponse, bonnes_reponses, annoncer_nombre,
     libelle_min, libelle_max, duree_secondes, explication, image_question, images_choix, max_reponses)
  select s.id, row_number() over (order by ordre), type, enonce, choix, bonne_reponse, bonnes_reponses,
         annoncer_nombre, libelle_min, libelle_max, duree_secondes, explication, image_question, images_choix,
         max_reponses
  from public.questions where quiz_id = qz.id;

  -- Étapes des ateliers : on retrouve la question de session par sa position dans le déroulé
  insert into public.etapes_session
    (session_id, question_id, ordre, titre, consigne, fichiers, liens, prompts, rendu_attendu)
  select s.id, qs.id, e.ordre, e.titre, e.consigne, e.fichiers, e.liens, e.prompts, e.rendu_attendu
  from public.etapes_atelier e
  join (select id, row_number() over (order by ordre) rang
        from public.questions where quiz_id = qz.id) qq on qq.id = e.question_id
  join public.questions_session qs on qs.session_id = s.id and qs.ordre = qq.rang;

  if p_mode_tables then
    insert into public.tables_salle (session_id, nom, ordre)
    select s.id, trim(nom), ord from unnest(p_noms_tables) with ordinality as t(nom, ord);
  end if;

  return jsonb_build_object('session_id', s.id, 'code', s.code);
end $$;

-- -----------------------------------------------------------------------------
-- A4. infos_session / rejoindre_session : session non terminée portant le code ;
--     sinon, distinction « pas encore commencé » (P0001) / « code inconnu » (P0002)
-- -----------------------------------------------------------------------------
create or replace function public.infos_session(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s public.sessions;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
begin
  select * into s from public.sessions where code = v_code and etat <> 'terminee';
  if not found then
    if exists (select 1 from public.quiz where code = v_code) then
      raise exception 'Le quiz n''a pas encore commencé. Attends le signal de ton formateur, puis réessaie.'
        using errcode = 'P0001';
    end if;
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

create or replace function public.rejoindre_session(p_code text, p_pseudo text, p_table_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s       public.sessions;
  p       public.participants;
  v_pseudo text := regexp_replace(trim(coalesce(p_pseudo, '')), '\s+', ' ', 'g');
  v_code  text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
begin
  if auth.uid() is null then
    raise exception 'Ta connexion a été interrompue. Recharge la page.' using errcode = '28000';
  end if;

  select * into s from public.sessions where code = v_code and etat <> 'terminee';
  if not found then
    if exists (select 1 from public.quiz where code = v_code) then
      raise exception 'Le quiz n''a pas encore commencé. Attends le signal de ton formateur, puis réessaie.'
        using errcode = 'P0001';
    end if;
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
-- B2. repondre : plusieurs réponses possibles pour une question ouverte
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
  v_rang  smallint := 1;
  nb_deja int;
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

  if q.type = 'atelier' then
    raise exception 'Cet atelier se fait à ton rythme : avance dans les étapes.' using errcode = '55000';
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

  -- Question ouverte : jusqu'à max_reponses réponses, une par une (rang 1, 2, 3…)
  if q.type = 'ouverte' then
    select count(*) into nb_deja from public.reponses
     where question_id = q.id and participant_id = moi.id;
    if nb_deja >= q.max_reponses then
      if q.max_reponses = 1 then
        raise exception 'Tu as déjà répondu à cette question.' using errcode = '23505';
      end if;
      raise exception 'Tu as déjà envoyé tes % réponses.', q.max_reponses using errcode = '23505';
    end if;
    v_rang := nb_deja + 1;
  end if;

  begin
    insert into public.reponses (session_id, question_id, participant_id, valeur, temps_ms, rang)
    values (s.id, q.id, moi.id, valeur,
            greatest(0, (extract(epoch from (now() - q.ouverte_le)) * 1000)::int), v_rang);
  exception when unique_violation then
    if q.type = 'ouverte' and q.max_reponses > 1 then
      raise exception 'Ta réponse n''a pas pu être enregistrée. Réessaie dans un instant.' using errcode = '23505';
    end if;
    raise exception 'Tu as déjà répondu à cette question.' using errcode = '23505';
  end;

  return jsonb_build_object('enregistree', true, 'rang', v_rang, 'max_reponses', q.max_reponses);
end $$;

-- -----------------------------------------------------------------------------
-- B3. Comptages : une personne ne compte qu'une fois par question
-- -----------------------------------------------------------------------------
create or replace function public.jauge_session(p_session uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with
    nb as (select count(*)::int n from public.participants where session_id = p_session),
    poids as (select coalesce(sum(public.poids_max_question(type)), 0)::int total
              from public.questions_session where session_id = p_session),
    pts as (select (count(distinct (question_id, participant_id)) + count(*) filter (where est_correcte))::int points
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

create or replace function public.calculer_mentions(p_session uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  nb_posees int;
begin
  select count(*) into nb_posees from public.questions_session
  where session_id = p_session and ouverte_le is not null and type <> 'atelier';

  -- « A répondu à tout » : questions DISTINCTES (plusieurs réponses à une ouverte = une)
  if nb_posees > 0 then
    insert into public.mentions (session_id, participant_id, type)
    select p_session, r.participant_id, 'a_repondu_a_tout'
    from public.reponses r where r.session_id = p_session
    group by r.participant_id having count(distinct r.question_id) = nb_posees
    on conflict do nothing;
  end if;

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
-- B4. resultats_question : toutes les réponses ; ma_reponse = la première,
--     mes_reponses = toutes les miennes ; nb_participants_ayant_repondu
-- -----------------------------------------------------------------------------
create or replace function public.resultats_question(p_question uuid, p_vue text default 'auto')
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
  else -- ouverte : toutes les réponses, textes sans pseudo (anonymat à l'écran)
    detail := jsonb_build_object(
      'reponses', coalesce((select jsonb_agg(jsonb_build_object(
                              'id', r.id,
                              'texte', r.valeur #>> '{}',
                              'coup_de_coeur', exists (select 1 from public.mentions m
                                                       where m.reponse_id = r.id and m.type = 'coup_de_coeur'))
                            order by r.cree_le, r.rang)
                            from public.reponses r where r.question_id = q.id and not r.masquee), '[]'::jsonb)
    );
  end if;

  detail := detail || jsonb_build_object(
    'question_id', q.id,
    'explication', q.explication,
    'max_reponses', q.max_reponses,
    -- nombre TOTAL de réponses (plusieurs par personne possibles pour une question ouverte)
    'nb_reponses', (select count(*) from public.reponses where question_id = q.id),
    'nb_participants_ayant_repondu', (select count(distinct participant_id) from public.reponses where question_id = q.id)
  );

  if not formateur then
    select * into moi from public.participants where session_id = q.session_id and utilisateur_id = auth.uid();
    select * into ma from public.reponses where question_id = q.id and participant_id = moi.id
     order by rang limit 1;
    detail := detail || jsonb_build_object(
      'ma_reponse',   case when ma.id is null then null else ma.valeur end,
      'mes_reponses', coalesce((select jsonb_agg(r.valeur order by r.rang)
                                from public.reponses r
                                where r.question_id = q.id and r.participant_id = moi.id), '[]'::jsonb),
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
-- B5. etat_session : nb_reponses = personnes ayant répondu, a_repondu = maximum
--     atteint, mes_reponses, question.max_reponses, mon_score par question distincte
-- -----------------------------------------------------------------------------
create or replace function public.etat_session(p_session uuid, p_vue text default 'auto')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s          public.sessions;
  q          public.questions_session;
  formateur  boolean;
  moi        public.participants;
  resultat   jsonb;
  ma_prog    public.progression_atelier;
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
        'image',          q.image_question,      -- chemin dans le stockage « quiz-images »
        'images_choix',   to_jsonb(q.images_choix),
        'choix',          to_jsonb(q.choix),     -- jamais bonne_reponse ni bonnes_reponses ici
        -- Nombre de bonnes réponses, seulement si le formateur choisit de l'annoncer
        'nb_bonnes',      case when q.type = 'qcm_multiple' and q.annoncer_nombre
                               then cardinality(q.bonnes_reponses) end,
        'libelle_min',    q.libelle_min,
        'libelle_max',    q.libelle_max,
        'duree_secondes', q.duree_secondes,
        'ouverte_le',     q.ouverte_le,
        'fin_reponses_le', s.fin_reponses_le,
        'max_reponses',   q.max_reponses,
        -- Nombre de PERSONNES ayant répondu ; le total des réponses est à part
        'nb_reponses',    (select count(distinct participant_id) from public.reponses where question_id = q.id),
        'nb_reponses_total', (select count(*) from public.reponses where question_id = q.id)
      ));
    if not formateur then
      resultat := resultat || jsonb_build_object(
        'a_repondu', case when q.type = 'ouverte'
                          then (select count(*) from public.reponses
                                where question_id = q.id and participant_id = moi.id) >= q.max_reponses
                          else exists (select 1 from public.reponses
                                       where question_id = q.id and participant_id = moi.id) end);
      if q.type = 'ouverte' then
        resultat := resultat || jsonb_build_object(
          'mes_reponses', coalesce((select jsonb_agg(r.valeur #>> '{}' order by r.rang)
                                    from public.reponses r
                                    where r.question_id = q.id and r.participant_id = moi.id), '[]'::jsonb));
      end if;
    end if;
    -- Atelier à son rythme : étapes, chiffres collectifs, rendu projeté (JAMAIS de pseudo)
    if q.type = 'atelier' then
      resultat := resultat || jsonb_build_object(
        'question', (resultat->'question') || jsonb_build_object(
          'etapes',      public.atelier_etapes_json(q.id),
          'explication', q.explication),     -- consigne générale (facultative, pas secrète)
        'atelier',  public.atelier_chiffres(s.id, q.id),
        'rendu_projete', (select jsonb_build_object('texte', r.texte, 'etape_titre', e.titre)
                          from public.rendus_atelier r
                          join public.etapes_session e on e.id = r.etape_id
                          where r.id = s.rendu_projete_id and e.question_id = q.id));
      if not formateur then
        select * into ma_prog from public.progression_atelier
         where question_id = q.id and participant_id = moi.id;
        resultat := resultat || jsonb_build_object(
          'ma_progression', jsonb_build_object(
            'etape',    coalesce(ma_prog.etape, 1),
            'termine',  coalesce(ma_prog.termine, false),
            'bloque',   ma_prog.bloque_depuis is not null,
            'en_route', coalesce(ma_prog.en_route, false)),
          'mes_rendus', coalesce((select jsonb_object_agg(r.etape_id, r.texte)
                                  from public.rendus_atelier r
                                  join public.etapes_session e on e.id = r.etape_id
                                  where r.participant_id = moi.id and e.question_id = q.id), '{}'::jsonb));
      end if;
    end if;
    if s.etat = 'resultats' then
      resultat := resultat || jsonb_build_object(
        'resultats', public.resultats_question(q.id, p_vue),
        -- Moment prévu par le formateur après cette question ; sinon, célébration
        -- automatique si au moins 80 % de la salle a trouvé à un QCM.
        'celebration', coalesce(
          (select c->>'message' from jsonb_array_elements(s.celebrations) c
           where (c->>'apres_question')::int = q.ordre limit 1),
          case when q.type in ('qcm', 'qcm_multiple')
                and (select count(*) filter (where r.est_correcte) * 100 >= 80 * count(*) and count(*) > 0
                     from public.reponses r where r.question_id = q.id)
               then (array['Bravo à toute la salle !',
                           'Belle réussite collective !',
                           'La salle a vu juste !',
                           'Quelle équipe : bravo à tous !'])[1 + (q.ordre - 1) % 4]
          end));
    end if;
  end if;

  if s.etat in ('bilan', 'terminee') then
    resultat := resultat || jsonb_build_object('bilan', public.bilan_session(s.id));
    -- Score PERSONNEL : uniquement pour le participant lui-même (jamais le formateur,
    -- jamais celui d'un autre : il est calculé ici à partir de `moi`, sans fonction dédiée).
    -- Plusieurs réponses à une même question ouverte ne comptent qu'une fois.
    if not formateur then
      resultat := resultat || jsonb_build_object('mon_score', jsonb_build_object(
        'questions_posees', (select count(*) from public.questions_session
                             where session_id = s.id and ouverte_le is not null),
        'reponses_donnees', (select count(distinct question_id) from public.reponses where participant_id = moi.id),
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
        'contribution',     (select count(distinct question_id) + count(distinct question_id) filter (where est_correcte)
                             from public.reponses where participant_id = moi.id)));
    end if;
  end if;

  return resultat;
end $$;

-- Export CSV : une ligne par réponse (ordre stable quand une personne en a plusieurs)
create or replace function public.export_session(p_session uuid)
returns table (
  question_ordre int, question_type public.type_question, question text,
  pseudo text, table_nom text, reponse text, est_correcte boolean, temps_secondes numeric,
  repondu_le timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.verifier_animateur(p_session);
  return query
    select q.ordre, q.type, case when btrim(q.enonce) = '' then '[photo]' else q.enonce end, p.pseudo, t.nom,
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
    order by q.ordre, p.pseudo, r.rang;
end $$;

-- -----------------------------------------------------------------------------
-- Droits d'exécution
-- -----------------------------------------------------------------------------
revoke execute on function
  public.infos_session(text), public.rejoindre_session(text, text, uuid),
  public.repondre(uuid, jsonb), public.lancer_session(uuid, boolean, text[]),
  public.terminer_session(uuid), public.archiver_session(uuid),
  public.etat_session(uuid, text), public.resultats_question(uuid, text),
  public.export_session(uuid)
from public, anon;
grant execute on function
  public.infos_session(text), public.rejoindre_session(text, text, uuid),
  public.repondre(uuid, jsonb), public.lancer_session(uuid, boolean, text[]),
  public.terminer_session(uuid), public.archiver_session(uuid),
  public.etat_session(uuid, text), public.resultats_question(uuid, text),
  public.export_session(uuid)
to authenticated;
