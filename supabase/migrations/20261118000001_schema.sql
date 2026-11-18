-- =============================================================================
-- REVOLia Live — schéma initial
-- =============================================================================
-- Principes (voir CLAUDE.md) :
--   * le serveur tranche : les participants n'écrivent QUE via des fonctions RPC ;
--   * la bonne réponse ne quitte jamais la base avant la fermeture de la question ;
--   * aucun classement : on calcule une jauge collective et des mentions positives ;
--   * RLS sur toutes les tables.
-- Les participants sont des utilisateurs Supabase « anonymes » (rôle authenticated).
-- Le formateur est un utilisateur listé dans la table `formateurs`.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.type_question as enum ('qcm', 'nuage', 'ouverte', 'echelle');
create type public.etape_session as enum ('attente', 'question', 'resultats', 'bilan', 'terminee');
create type public.type_mention  as enum ('a_repondu_a_tout', 'plus_belle_progression', 'coup_de_coeur');

-- -----------------------------------------------------------------------------
-- Formateurs (liste blanche : seul un utilisateur présent ici peut créer des quiz)
-- -----------------------------------------------------------------------------
create table public.formateurs (
  id       uuid primary key references auth.users (id) on delete cascade,
  email    text not null,
  cree_le  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Quiz et questions (ce que le formateur prépare à l'avance)
-- -----------------------------------------------------------------------------
create table public.quiz (
  id            uuid primary key default gen_random_uuid(),
  formateur_id  uuid not null references public.formateurs (id) on delete cascade,
  titre         text not null check (char_length(titre) between 1 and 120),
  description   text check (char_length(description) <= 500),
  cree_le       timestamptz not null default now(),
  modifie_le    timestamptz not null default now()
);
create index on public.quiz (formateur_id);

create table public.questions (
  id                  uuid primary key default gen_random_uuid(),
  quiz_id             uuid not null references public.quiz (id) on delete cascade,
  ordre               int  not null,
  type                public.type_question not null,
  enonce              text not null check (char_length(enonce) between 1 and 300),
  -- QCM : 2 à 6 propositions, et l'indice (0-based) de la bonne
  choix               text[],
  bonne_reponse       smallint,
  -- Échelle 1 à 5 : libellés facultatifs des extrémités
  libelle_min         text check (char_length(libelle_min) <= 40),
  libelle_max         text check (char_length(libelle_max) <= 40),
  duree_secondes      int  not null default 30 check (duree_secondes between 5 and 600),
  unique (quiz_id, ordre) deferrable initially deferred,
  constraint qcm_coherent check (
    (type = 'qcm'
       and choix is not null
       and array_length(choix, 1) between 2 and 6
       and bonne_reponse is not null
       and bonne_reponse >= 0 and bonne_reponse < array_length(choix, 1))
    or (type <> 'qcm' and choix is null and bonne_reponse is null)
  )
);

-- -----------------------------------------------------------------------------
-- Sessions (une animation en direct d'un quiz)
-- -----------------------------------------------------------------------------
create table public.sessions (
  id                    uuid primary key default gen_random_uuid(),
  formateur_id          uuid not null references public.formateurs (id) on delete cascade,
  quiz_id               uuid references public.quiz (id) on delete set null,
  titre                 text not null,
  code                  text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  etat                  public.etape_session not null default 'attente',
  question_courante_id  uuid,  -- FK ajoutée plus bas (dépendance circulaire)
  fin_reponses_le       timestamptz,
  mode_tables           boolean not null default false,
  -- Paliers de la jauge collective, en fraction du maximum atteignable
  paliers               numeric[] not null default '{0.4,0.65,0.85}',
  retention_jours       int not null default 90 check (retention_jours between 1 and 730),
  cree_le               timestamptz not null default now(),
  terminee_le           timestamptz
);
create index on public.sessions (formateur_id);

-- Copie figée des questions au lancement : modifier un quiz ne fausse jamais
-- les résultats d'une session passée.
create table public.questions_session (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions (id) on delete cascade,
  ordre           int  not null,
  type            public.type_question not null,
  enonce          text not null,
  choix           text[],
  bonne_reponse   smallint,         -- SECRET tant que la question n'est pas fermée
  libelle_min     text,
  libelle_max     text,
  duree_secondes  int  not null,
  ouverte_le      timestamptz,
  fermee_le       timestamptz,
  unique (session_id, ordre)
);

alter table public.sessions
  add constraint sessions_question_courante_fk
  foreign key (question_courante_id) references public.questions_session (id) on delete set null;

create table public.tables_salle (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions (id) on delete cascade,
  nom         text not null check (char_length(nom) between 1 and 40),
  ordre       int  not null,
  unique (session_id, ordre)
);

create table public.participants (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions (id) on delete cascade,
  utilisateur_id  uuid not null references auth.users (id) on delete cascade,
  pseudo          text not null check (char_length(pseudo) between 1 and 20),
  table_id        uuid references public.tables_salle (id) on delete set null,
  -- V2 : rattachement à un profil durable. Laisser nullable, ne pas supprimer.
  profil_id       uuid,
  rejoint_le      timestamptz not null default now(),
  unique (session_id, utilisateur_id)
);
create unique index participants_pseudo_unique on public.participants (session_id, lower(pseudo));
create index on public.participants (utilisateur_id);

create table public.reponses (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions (id) on delete cascade,
  question_id     uuid not null references public.questions_session (id) on delete cascade,
  participant_id  uuid not null references public.participants (id) on delete cascade,
  valeur          jsonb not null,
  -- Calculé à la FERMETURE de la question (sinon le participant pourrait le lire trop tôt)
  est_correcte    boolean,
  temps_ms        int not null,
  masquee         boolean not null default false,  -- modération par le formateur
  cree_le         timestamptz not null default now(),
  unique (question_id, participant_id)
);
create index on public.reponses (session_id);

create table public.mentions (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions (id) on delete cascade,
  participant_id  uuid not null references public.participants (id) on delete cascade,
  type            public.type_mention not null,
  reponse_id      uuid references public.reponses (id) on delete cascade,
  cree_le         timestamptz not null default now()
);
create unique index mentions_auto_unique on public.mentions (session_id, participant_id, type)
  where type <> 'coup_de_coeur';
create unique index mentions_coeur_unique on public.mentions (reponse_id)
  where type = 'coup_de_coeur';

-- -----------------------------------------------------------------------------
-- Fonctions utilitaires
-- -----------------------------------------------------------------------------
create or replace function public.est_formateur()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.formateurs where id = auth.uid());
$$;

create or replace function public.anime_session(p_session uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sessions where id = p_session and formateur_id = auth.uid());
$$;

create or replace function public.participe_a(p_session uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.participants
                 where session_id = p_session and utilisateur_id = auth.uid());
$$;

-- Code court sans caractères ambigus (pas de 0/O, 1/I/L)
create or replace function public.generer_code()
returns text language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  resultat text;
begin
  loop
    resultat := '';
    for i in 1..6 loop
      resultat := resultat || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.sessions where code = resultat);
  end loop;
  return resultat;
end $$;

create or replace function public.maj_modifie_le()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.modifie_le := now();
  return new;
end $$;
create trigger quiz_modifie_le before update on public.quiz
  for each row execute function public.maj_modifie_le();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.formateurs        enable row level security;
alter table public.quiz              enable row level security;
alter table public.questions         enable row level security;
alter table public.sessions          enable row level security;
alter table public.questions_session enable row level security;
alter table public.tables_salle      enable row level security;
alter table public.participants      enable row level security;
alter table public.reponses          enable row level security;
alter table public.mentions          enable row level security;

-- Formateurs : chacun ne voit que sa ligne. L'ajout se fait à la main (voir README).
create policy "formateur lit sa fiche" on public.formateurs
  for select to authenticated using (id = auth.uid());

-- Quiz et questions : réservés à leur formateur.
create policy "formateur gère ses quiz" on public.quiz
  for all to authenticated
  using (formateur_id = auth.uid())
  with check (formateur_id = auth.uid() and public.est_formateur());

create policy "formateur gère ses questions" on public.questions
  for all to authenticated
  using (exists (select 1 from public.quiz q where q.id = quiz_id and q.formateur_id = auth.uid()))
  with check (exists (select 1 from public.quiz q where q.id = quiz_id and q.formateur_id = auth.uid()));

-- Sessions : lisibles par le formateur et par les participants (pour le temps réel).
-- Aucune écriture directe : tout passe par les fonctions de pilotage.
create policy "lecture session" on public.sessions
  for select to authenticated
  using (formateur_id = auth.uid() or public.participe_a(id));

-- Questions de session : formateur uniquement (contient bonne_reponse).
-- Les participants passent par etat_session(), qui masque la solution.
create policy "formateur lit les questions de session" on public.questions_session
  for select to authenticated using (public.anime_session(session_id));

create policy "lecture tables" on public.tables_salle
  for select to authenticated
  using (public.anime_session(session_id) or public.participe_a(session_id));

create policy "lecture participants" on public.participants
  for select to authenticated
  using (utilisateur_id = auth.uid() or public.anime_session(session_id));

-- est_correcte est NULL tant que la question est ouverte : lire sa propre ligne ne trahit rien.
create policy "lecture réponses" on public.reponses
  for select to authenticated
  using (public.anime_session(session_id)
         or exists (select 1 from public.participants p
                    where p.id = participant_id and p.utilisateur_id = auth.uid()));

create policy "lecture mentions" on public.mentions
  for select to authenticated
  using (public.anime_session(session_id) or public.participe_a(session_id));

-- -----------------------------------------------------------------------------
-- Temps réel : le présentateur suit les arrivées et les réponses,
-- les téléphones suivent les changements d'état de la session.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.sessions, public.participants, public.reponses;
  end if;
end $$;
