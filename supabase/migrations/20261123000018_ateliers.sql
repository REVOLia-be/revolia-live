-- =============================================================================
-- Ateliers à son rythme (voir docs/SPEC-ATELIERS.md)
-- Un atelier est une question de type `atelier` dans le déroulé : chaque téléphone
-- parcourt des étapes à son rythme. L'écran projeté ne montre que des chiffres
-- collectifs ; les pseudos et les rendus ne sont lisibles que par le formateur.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Fonctions de validation (immuables, sans accès aux tables : utilisables dans
-- un CHECK, qui s'exécute avec les droits de l'appelant)
-- -----------------------------------------------------------------------------
create or replace function public.chemin_fichier_valide(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|docx|xlsx|pptx|png|jpg|jpeg|webp|txt|csv)$';
$$;

-- [{ "chemin": "<uuid>/<uuid>.<ext>", "nom": "Modèle.docx", "taille": 12345 }] — 10 au plus
create or replace function public.fichiers_atelier_valides(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare e jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 10 then return false; end if;
  for e in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(e) <> 'object'
       or jsonb_typeof(e->'chemin') is distinct from 'string'
       or jsonb_typeof(e->'nom') is distinct from 'string'
       or jsonb_typeof(e->'taille') is distinct from 'number' then
      return false;
    end if;
    if not public.chemin_fichier_valide(e->>'chemin')
       or char_length(e->>'nom') not between 1 and 200
       or (e->>'taille')::numeric < 0 or (e->>'taille')::numeric > 20971520 then
      return false;
    end if;
  end loop;
  return true;
end $$;

-- [{ "url": "https://…", "libelle": "…" }] — 10 au plus, https uniquement
create or replace function public.liens_atelier_valides(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare e jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 10 then return false; end if;
  for e in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(e) <> 'object'
       or jsonb_typeof(e->'url') is distinct from 'string'
       or jsonb_typeof(e->'libelle') is distinct from 'string' then
      return false;
    end if;
    if (e->>'url') !~ '^https://[^[:space:]]+$' or char_length(e->>'url') > 500
       or char_length(e->>'libelle') not between 1 and 120 then
      return false;
    end if;
  end loop;
  return true;
end $$;

-- [{ "titre": "…", "texte": "…" }] — 10 au plus, texte ≤ 4000
create or replace function public.prompts_atelier_valides(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare e jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 10 then return false; end if;
  for e in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(e) <> 'object'
       or jsonb_typeof(e->'titre') is distinct from 'string'
       or jsonb_typeof(e->'texte') is distinct from 'string' then
      return false;
    end if;
    if char_length(e->>'titre') not between 1 and 120
       or char_length(e->>'texte') not between 1 and 4000 then
      return false;
    end if;
  end loop;
  return true;
end $$;

revoke execute on function public.chemin_fichier_valide(text), public.fichiers_atelier_valides(jsonb),
  public.liens_atelier_valides(jsonb), public.prompts_atelier_valides(jsonb) from public, anon;
grant execute on function public.chemin_fichier_valide(text), public.fichiers_atelier_valides(jsonb),
  public.liens_atelier_valides(jsonb), public.prompts_atelier_valides(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Questions : un atelier est valide (titre = énoncé, rien d'autre de QCM)
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
  or (type = 'atelier'
     and choix is null and bonne_reponse is null and bonnes_reponses is null
     and image_question is null
     and char_length(btrim(enonce)) >= 1)
  or (type not in ('qcm', 'qcm_multiple', 'atelier')
     and choix is null and bonne_reponse is null and bonnes_reponses is null)
);

-- -----------------------------------------------------------------------------
-- Étapes préparées par le formateur
-- -----------------------------------------------------------------------------
create table public.etapes_atelier (
  id             uuid primary key default gen_random_uuid(),
  question_id    uuid not null references public.questions (id) on delete cascade,
  ordre          int  not null check (ordre >= 1),
  titre          text not null check (char_length(titre) between 1 and 120),
  consigne       text not null default '' check (char_length(consigne) <= 4000),
  fichiers       jsonb not null default '[]',
  liens          jsonb not null default '[]',
  prompts        jsonb not null default '[]',
  rendu_attendu  boolean not null default false,
  unique (question_id, ordre) deferrable initially deferred,
  constraint etapes_atelier_fichiers_valides check (public.fichiers_atelier_valides(fichiers)),
  constraint etapes_atelier_liens_valides    check (public.liens_atelier_valides(liens)),
  constraint etapes_atelier_prompts_valides  check (public.prompts_atelier_valides(prompts))
);

-- Une étape n'appartient qu'à une question de type atelier (pas de sous-requête dans un CHECK)
create or replace function public.verifier_question_atelier()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.questions where id = new.question_id and type = 'atelier') then
    raise exception 'Seule une question de type atelier peut avoir des étapes.' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger etapes_atelier_question_atelier before insert or update of question_id on public.etapes_atelier
  for each row execute function public.verifier_question_atelier();

-- On ne transforme pas en autre chose une question qui a déjà des étapes
create or replace function public.verifier_type_question_atelier()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.type <> 'atelier' and exists (select 1 from public.etapes_atelier where question_id = new.id) then
    raise exception 'Supprime d''abord les étapes de cet atelier pour changer son type.' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger questions_type_atelier before update of type on public.questions
  for each row execute function public.verifier_type_question_atelier();
revoke execute on function public.verifier_question_atelier(), public.verifier_type_question_atelier() from public, anon, authenticated;

-- Copie figée au lancement de la session
create table public.etapes_session (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions (id) on delete cascade,
  question_id    uuid not null references public.questions_session (id) on delete cascade,
  ordre          int  not null,
  titre          text not null,
  consigne       text not null default '',
  fichiers       jsonb not null default '[]',
  liens          jsonb not null default '[]',
  prompts        jsonb not null default '[]',
  rendu_attendu  boolean not null default false,
  unique (question_id, ordre)
);
create index on public.etapes_session (session_id);

-- -----------------------------------------------------------------------------
-- Suivi des participants (écritures uniquement par les fonctions ci-dessous)
-- -----------------------------------------------------------------------------
create table public.progression_atelier (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions (id) on delete cascade,
  question_id     uuid not null references public.questions_session (id) on delete cascade,
  participant_id  uuid not null references public.participants (id) on delete cascade,
  etape           int  not null default 1 check (etape >= 1),
  termine         boolean not null default false,
  bloque_depuis   timestamptz,
  en_route        boolean not null default false,
  maj_le          timestamptz not null default now(),
  unique (question_id, participant_id)
);
create index on public.progression_atelier (session_id);

create table public.rendus_atelier (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions (id) on delete cascade,
  etape_id        uuid not null references public.etapes_session (id) on delete cascade,
  participant_id  uuid not null references public.participants (id) on delete cascade,
  texte           text not null check (char_length(texte) between 1 and 5000),
  cree_le         timestamptz not null default now(),
  maj_le          timestamptz not null default now(),
  unique (etape_id, participant_id)
);
create index on public.rendus_atelier (session_id);

alter table public.sessions
  add column rendu_projete_id uuid references public.rendus_atelier (id) on delete set null;

-- -----------------------------------------------------------------------------
-- Row Level Security et droits
-- -----------------------------------------------------------------------------
alter table public.etapes_atelier      enable row level security;
alter table public.etapes_session      enable row level security;
alter table public.progression_atelier enable row level security;
alter table public.rendus_atelier      enable row level security;

create policy "formateur ou admin gère les étapes" on public.etapes_atelier
  for all to authenticated
  using (exists (select 1 from public.questions qu join public.quiz z on z.id = qu.quiz_id
                 where qu.id = question_id
                   and ((z.formateur_id = auth.uid() and public.est_formateur()) or public.est_admin())))
  with check (exists (select 1 from public.questions qu join public.quiz z on z.id = qu.quiz_id
                 where qu.id = question_id
                   and ((z.formateur_id = auth.uid() and public.est_formateur()) or public.est_admin())));

-- Le contenu des étapes n'est pas secret : formateur de la session et ses participants
create policy "lecture étapes de session" on public.etapes_session
  for select to authenticated
  using (public.anime_session(session_id) or public.participe_a(session_id));

-- Suivi et rendus : le formateur voit tout, un participant ne voit que ses propres lignes
create policy "lecture progression" on public.progression_atelier
  for select to authenticated
  using (public.anime_session(session_id)
         or exists (select 1 from public.participants p
                    where p.id = participant_id and p.utilisateur_id = auth.uid()));
create policy "lecture rendus" on public.rendus_atelier
  for select to authenticated
  using (public.anime_session(session_id)
         or exists (select 1 from public.participants p
                    where p.id = participant_id and p.utilisateur_id = auth.uid()));

grant select, insert, update, delete on public.etapes_atelier to authenticated;
grant select on public.etapes_session, public.progression_atelier, public.rendus_atelier to authenticated;

-- Temps réel
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.progression_atelier, public.rendus_atelier;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Stockage : fichiers des étapes (seulement sur Supabase ; ignoré en local)
-- -----------------------------------------------------------------------------
do $do$
declare
  mimes text[] := array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv'];
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'Pas de schéma storage : partie stockage ignorée (base de test).';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('atelier-fichiers', 'atelier-fichiers', true, 20971520, mimes)
  on conflict (id) do update set public = true, file_size_limit = 20971520, allowed_mime_types = mimes;

  execute $p$create policy "formateur dépose ses fichiers d'atelier" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'atelier-fichiers' and public.est_formateur()
                and ((storage.foldername(name))[1] = auth.uid()::text or public.est_admin()))$p$;
  execute $p$create policy "formateur gère ses fichiers d'atelier" on storage.objects
    for update to authenticated
    using (bucket_id = 'atelier-fichiers' and ((storage.foldername(name))[1] = auth.uid()::text or public.est_admin()))$p$;
  execute $p$create policy "formateur supprime ses fichiers d'atelier" on storage.objects
    for delete to authenticated
    using (bucket_id = 'atelier-fichiers' and ((storage.foldername(name))[1] = auth.uid()::text or public.est_admin()))$p$;
end
$do$;

-- -----------------------------------------------------------------------------
-- Jauge : un atelier ne compte pas
-- -----------------------------------------------------------------------------
create or replace function public.poids_max_question(p_type public.type_question)
returns int language sql immutable set search_path = '' as $$
  select case when p_type = 'atelier' then 0
              when p_type in ('qcm', 'qcm_multiple') then 2
              else 1 end;
$$;

-- « A répondu à tout » : un atelier ne se répond pas par `reponses`, on ne le compte pas
create or replace function public.calculer_mentions(p_session uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  nb_posees int;
begin
  select count(*) into nb_posees from public.questions_session
  where session_id = p_session and ouverte_le is not null and type <> 'atelier';

  if nb_posees > 0 then
    insert into public.mentions (session_id, participant_id, type)
    select p_session, r.participant_id, 'a_repondu_a_tout'
    from public.reponses r where r.session_id = p_session
    group by r.participant_id having count(*) = nb_posees
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
-- lancer_session : copie aussi les étapes des ateliers
-- -----------------------------------------------------------------------------
create or replace function public.lancer_session(
  p_quiz uuid, p_mode_tables boolean default false, p_noms_tables text[] default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  qz  public.quiz;
  s   public.sessions;
  vide text;
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

  insert into public.sessions (formateur_id, quiz_id, titre, code, mode_tables, celebrations)
  values (auth.uid(), qz.id, qz.titre, public.generer_code(), p_mode_tables, qz.celebrations)
  returning * into s;

  insert into public.questions_session
    (session_id, ordre, type, enonce, choix, bonne_reponse, bonnes_reponses, annoncer_nombre,
     libelle_min, libelle_max, duree_secondes, explication, image_question, images_choix)
  select s.id, row_number() over (order by ordre), type, enonce, choix, bonne_reponse, bonnes_reponses,
         annoncer_nombre, libelle_min, libelle_max, duree_secondes, explication, image_question, images_choix
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
-- ouvrir_question : pas de compte à rebours pour un atelier
-- -----------------------------------------------------------------------------
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
         rendu_projete_id = null,
         fin_reponses_le = case when q.type = 'atelier' then null
                                else now() + make_interval(secs => q.duree_secondes) end
   where id = s.id;
  return public.etat_session(s.id);
end $$;

-- -----------------------------------------------------------------------------
-- Chiffres collectifs d'un atelier (interne : jamais de pseudo)
-- Un participant qui n'a encore rien fait est à l'étape 1.
-- -----------------------------------------------------------------------------
create or replace function public.atelier_chiffres(p_session uuid, p_question uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with nb as (select count(*)::int n from public.etapes_session where question_id = p_question),
  prog as (
    select coalesce(pa.etape, 1) etape, coalesce(pa.termine, false) termine, pa.bloque_depuis
    from public.participants p
    left join public.progression_atelier pa on pa.participant_id = p.id and pa.question_id = p_question
    where p.session_id = p_session)
  select jsonb_build_object(
    'repartition', coalesce((select jsonb_agg((select count(*) from prog where not prog.termine and prog.etape = g.k)::int
                                              order by g.k)
                             from nb, generate_series(1, nb.n) g(k)), '[]'::jsonb),
    'ont_termine', (select count(*) from prog where termine),
    'nb_bloques',  (select count(*) from prog where bloque_depuis is not null));
$$;

create or replace function public.atelier_etapes_json(p_question uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'ordre', e.ordre, 'titre', e.titre, 'consigne', e.consigne,
           'fichiers', e.fichiers, 'liens', e.liens, 'prompts', e.prompts,
           'rendu_attendu', e.rendu_attendu) order by e.ordre), '[]'::jsonb)
  from public.etapes_session e where e.question_id = p_question;
$$;
revoke execute on function public.atelier_chiffres(uuid, uuid), public.atelier_etapes_json(uuid)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- fermer_question : un atelier n'a pas de justesse à calculer ; on arrête la projection
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
     set etat = 'resultats', fin_reponses_le = least(fin_reponses_le, now()),
         rendu_projete_id = null   -- on n'affiche plus de rendu une fois l'atelier terminé
   where id = s.id;
  return public.etat_session(s.id);
end $$;

-- -----------------------------------------------------------------------------
-- repondre : refuse proprement un atelier (il a ses propres fonctions)
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
-- etat_session : ajouts pour l'atelier (tout le comportement existant est conservé)
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
        'nb_reponses',    (select count(*) from public.reponses where question_id = q.id)
      ));
    if not formateur then
      resultat := resultat || jsonb_build_object(
        'a_repondu', exists (select 1 from public.reponses where question_id = q.id and participant_id = moi.id));
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

-- =============================================================================
-- RPC PARTICIPANT
-- =============================================================================
-- Interne : vérifie que l'appelant participe à la session de l'atelier et que cet
-- atelier est bien la question en cours, ouverte. Renvoie la fiche participant.
create or replace function public.atelier_verifier_participant(p_question uuid)
returns public.participants language plpgsql stable security definer set search_path = '' as $$
declare
  q    public.questions_session;
  s    public.sessions;
  moi  public.participants;
begin
  select * into q from public.questions_session where id = p_question and type = 'atelier';
  if not found then
    raise exception 'Cet atelier n''existe plus.' using errcode = 'P0002';
  end if;
  select * into moi from public.participants where session_id = q.session_id and utilisateur_id = auth.uid();
  if not found then
    raise exception 'Tu ne participes pas à ce quiz. Rejoins-le avec son code.' using errcode = '42501';
  end if;
  select * into s from public.sessions where id = q.session_id;
  if s.etat <> 'question' or s.question_courante_id is distinct from q.id then
    raise exception 'Cet atelier n''est pas ouvert en ce moment.' using errcode = '55000';
  end if;
  return moi;
end $$;
revoke execute on function public.atelier_verifier_participant(uuid) from public, anon, authenticated;

create or replace function public.atelier_aller_a(p_question uuid, p_etape int)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  moi  public.participants := public.atelier_verifier_participant(p_question);
  nb   int;
  pa   public.progression_atelier;
begin
  select count(*) into nb from public.etapes_session where question_id = p_question;
  if p_etape is null or p_etape < 1 or p_etape > nb + 1 then
    raise exception 'Cette étape n''existe pas.' using errcode = '22023';
  end if;
  insert into public.progression_atelier (session_id, question_id, participant_id, etape, termine)
  values (moi.session_id, p_question, moi.id, p_etape, p_etape = nb + 1)
  on conflict (question_id, participant_id)
  do update set etape = excluded.etape, termine = excluded.termine, maj_le = now()
  returning * into pa;
  return jsonb_build_object('etape', pa.etape, 'termine', pa.termine,
                            'bloque', pa.bloque_depuis is not null, 'en_route', pa.en_route);
end $$;

create or replace function public.atelier_rendre(p_etape uuid, p_texte text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  e      public.etapes_session;
  moi    public.participants;
  texte  text := btrim(coalesce(p_texte, ''));
begin
  select * into e from public.etapes_session where id = p_etape;
  if not found then
    raise exception 'Cette étape n''existe plus.' using errcode = 'P0002';
  end if;
  moi := public.atelier_verifier_participant(e.question_id);
  if not e.rendu_attendu then
    raise exception 'Cette étape ne demande pas de rendu.' using errcode = '55000';
  end if;
  if char_length(texte) < 1 or char_length(texte) > 5000 then
    raise exception 'Ton rendu doit faire entre 1 et 5000 caractères.' using errcode = '22023';
  end if;
  insert into public.rendus_atelier (session_id, etape_id, participant_id, texte)
  values (moi.session_id, e.id, moi.id, texte)
  on conflict (etape_id, participant_id)
  do update set texte = excluded.texte, maj_le = now();
  return jsonb_build_object('enregistre', true);
end $$;

create or replace function public.atelier_bloque(p_question uuid, p_bloque boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  moi  public.participants := public.atelier_verifier_participant(p_question);
  pa   public.progression_atelier;
begin
  insert into public.progression_atelier (session_id, question_id, participant_id, bloque_depuis)
  values (moi.session_id, p_question, moi.id, case when p_bloque then now() end)
  on conflict (question_id, participant_id)
  do update set
    bloque_depuis = case when p_bloque then coalesce(public.progression_atelier.bloque_depuis, now()) end,
    en_route      = case when p_bloque then public.progression_atelier.en_route else false end,
    maj_le        = now()
  returning * into pa;
  return jsonb_build_object('etape', pa.etape, 'termine', pa.termine,
                            'bloque', pa.bloque_depuis is not null, 'en_route', pa.en_route);
end $$;

-- =============================================================================
-- RPC FORMATEUR
-- =============================================================================
-- Interne : l'atelier en cours (ou le dernier atelier posé s'il vient d'être terminé)
create or replace function public.atelier_courant(p_session uuid)
returns public.questions_session language plpgsql stable security definer set search_path = '' as $$
declare q public.questions_session;
begin
  select qs.* into q from public.sessions s
  join public.questions_session qs on qs.id = s.question_courante_id
  where s.id = p_session and qs.type = 'atelier';
  if not found then
    raise exception 'Aucun atelier n''est en cours.' using errcode = '55000';
  end if;
  return q;
end $$;
revoke execute on function public.atelier_courant(uuid) from public, anon, authenticated;

create or replace function public.atelier_suivi(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s  public.sessions := public.verifier_animateur(p_session);
  q  public.questions_session := public.atelier_courant(p_session);
begin
  return jsonb_build_object(
    'question_id', q.id,
    'etapes', coalesce((select jsonb_agg(jsonb_build_object(
                'id', e.id, 'ordre', e.ordre, 'titre', e.titre, 'rendu_attendu', e.rendu_attendu)
                order by e.ordre)
              from public.etapes_session e where e.question_id = q.id), '[]'::jsonb),
    'participants', coalesce((select jsonb_agg(jsonb_build_object(
                'participant_id', p.id, 'pseudo', p.pseudo,
                'etape', coalesce(pa.etape, 1), 'termine', coalesce(pa.termine, false),
                'bloque_depuis', pa.bloque_depuis, 'en_route', coalesce(pa.en_route, false),
                'maj_le', pa.maj_le) order by p.pseudo)
              from public.participants p
              left join public.progression_atelier pa on pa.participant_id = p.id and pa.question_id = q.id
              where p.session_id = s.id), '[]'::jsonb),
    'rendus', coalesce((select jsonb_agg(jsonb_build_object(
                'id', r.id, 'etape_id', r.etape_id, 'participant_id', r.participant_id,
                'pseudo', p.pseudo, 'texte', r.texte, 'maj_le', r.maj_le)
                order by e.ordre, r.maj_le)
              from public.rendus_atelier r
              join public.etapes_session e on e.id = r.etape_id
              join public.participants p on p.id = r.participant_id
              where e.question_id = q.id), '[]'::jsonb));
end $$;

create or replace function public.atelier_en_route(p_participant uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  p  public.participants;
  q  public.questions_session;
begin
  select * into p from public.participants where id = p_participant;
  if not found then
    raise exception 'Ce participant est introuvable.' using errcode = 'P0002';
  end if;
  perform public.verifier_animateur(p.session_id);
  q := public.atelier_courant(p.session_id);
  update public.progression_atelier set en_route = true, maj_le = now()
   where question_id = q.id and participant_id = p.id and bloque_depuis is not null;
  if not found then
    raise exception 'Ce participant ne demande plus d''aide.' using errcode = '55000';
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.atelier_resolu(p_participant uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  p  public.participants;
  q  public.questions_session;
begin
  select * into p from public.participants where id = p_participant;
  if not found then
    raise exception 'Ce participant est introuvable.' using errcode = 'P0002';
  end if;
  perform public.verifier_animateur(p.session_id);
  q := public.atelier_courant(p.session_id);
  update public.progression_atelier set bloque_depuis = null, en_route = false, maj_le = now()
   where question_id = q.id and participant_id = p.id;
  return jsonb_build_object('ok', true);
end $$;

-- Projette un rendu (sans pseudo) sur l'écran, ou arrête la projection (p_rendu null).
create or replace function public.projeter_rendu(p_session uuid, p_rendu uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s  public.sessions := public.verifier_animateur(p_session);
begin
  if p_rendu is not null then
    if not exists (select 1 from public.rendus_atelier where id = p_rendu and session_id = s.id) then
      raise exception 'Ce rendu est introuvable dans cette session.' using errcode = 'P0002';
    end if;
    if s.etat <> 'question' or not exists (
         select 1 from public.rendus_atelier r join public.etapes_session e on e.id = r.etape_id
         where r.id = p_rendu and e.question_id = s.question_courante_id) then
      raise exception 'Ce rendu n''appartient pas à l''atelier en cours.' using errcode = '55000';
    end if;
  end if;
  update public.sessions set rendu_projete_id = p_rendu where id = s.id;
  return public.etat_session(s.id);
end $$;

revoke execute on function
  public.atelier_aller_a(uuid, int), public.atelier_rendre(uuid, text), public.atelier_bloque(uuid, boolean),
  public.atelier_suivi(uuid), public.atelier_en_route(uuid), public.atelier_resolu(uuid),
  public.projeter_rendu(uuid, uuid)
  from public, anon;
grant execute on function
  public.atelier_aller_a(uuid, int), public.atelier_rendre(uuid, text), public.atelier_bloque(uuid, boolean),
  public.atelier_suivi(uuid), public.atelier_en_route(uuid), public.atelier_resolu(uuid),
  public.projeter_rendu(uuid, uuid)
  to authenticated;
