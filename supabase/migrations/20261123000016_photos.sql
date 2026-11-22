-- =============================================================================
-- Questions avec photos (fournies par le formateur)
--   * image_question : une photo affichée avec la question (tous types) ; l'énoncé
--     texte devient alors facultatif ;
--   * images_choix : une photo par proposition (QCM simple ou multiple), le texte
--     de la proposition devenant une légende facultative.
-- Les photos vivent dans le stockage Supabase, bucket public « quiz-images »,
-- rangées par formateur : <id du formateur>/<identifiant>.<webp|jpg|png>.
-- Seuls des chemins de ce format sont acceptés : aucune image externe (RGPD).
-- =============================================================================
create or replace function public.chemin_image_valide(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg|png)$';
$$;
grant execute on function public.chemin_image_valide(text) to authenticated;

alter table public.questions
  add column image_question text constraint questions_image_valide check (image_question is null or public.chemin_image_valide(image_question)),
  add column images_choix text[];
alter table public.questions_session
  add column image_question text,
  add column images_choix text[];

-- Énoncé : facultatif s'il y a une photo
alter table public.questions drop constraint questions_enonce_check;
alter table public.questions add constraint questions_enonce_check
  check (char_length(enonce) <= 300 and (char_length(btrim(enonce)) >= 1 or image_question is not null));

-- Photos des propositions : QCM uniquement, une par proposition, toutes valides
create or replace function public.images_choix_valides(p text[], nb_choix int)
returns boolean language sql immutable set search_path = '' as $$
  select array_ndims(p) = 1
     and cardinality(p) = coalesce(nb_choix, -1)
     and not exists (select 1 from unnest(p) i where i is null or not public.chemin_image_valide(i));
$$;
grant execute on function public.images_choix_valides(text[], int) to authenticated;

alter table public.questions add constraint questions_images_choix_valides check (
  images_choix is null
  or (type in ('qcm', 'qcm_multiple') and public.images_choix_valides(images_choix, cardinality(choix)))
);

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
     libelle_min, libelle_max, duree_secondes, explication, image_question, images_choix)
  select s.id, row_number() over (order by ordre), type, enonce, choix, bonne_reponse, bonnes_reponses,
         annoncer_nombre, libelle_min, libelle_max, duree_secondes, explication, image_question, images_choix
  from public.questions where quiz_id = qz.id;

  if p_mode_tables then
    insert into public.tables_salle (session_id, nom, ordre)
    select s.id, trim(nom), ord from unnest(p_noms_tables) with ordinality as t(nom, ord);
  end if;

  return jsonb_build_object('session_id', s.id, 'code', s.code);
end $$;

create or replace function public.etat_session(p_session uuid, p_vue text default 'auto')
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
    order by q.ordre, p.pseudo;
end $$;

-- -----------------------------------------------------------------------------
-- Stockage (seulement sur Supabase ; ignoré par la base de test locale)
-- -----------------------------------------------------------------------------
do $do$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'Pas de schéma storage : partie stockage ignorée (base de test).';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('quiz-images', 'quiz-images', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
  on conflict (id) do update set public = true, file_size_limit = 2097152,
    allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'];

  execute $p$create policy "formateur dépose ses photos" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'quiz-images' and public.est_formateur()
                and ((storage.foldername(name))[1] = auth.uid()::text or public.est_admin()))$p$;
  execute $p$create policy "formateur gère ses photos" on storage.objects
    for update to authenticated
    using (bucket_id = 'quiz-images' and ((storage.foldername(name))[1] = auth.uid()::text or public.est_admin()))$p$;
  execute $p$create policy "formateur supprime ses photos" on storage.objects
    for delete to authenticated
    using (bucket_id = 'quiz-images' and ((storage.foldername(name))[1] = auth.uid()::text or public.est_admin()))$p$;
end
$do$;
