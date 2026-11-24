-- =============================================================================
-- Rapport de quiz par email + inscription newsletter + réglages d'administration
-- (voir docs/SPEC-RAPPORT-EMAIL.md)
--
--   * Tout est DÉSACTIVÉ par défaut ; seuls les administrateurs règlent le dispositif
--     (interrupteur général, formateur, quiz) : l'admin a le dernier mot à chaque niveau.
--   * Le participant demande son rapport (RPC) ; la page du rapport se lit avec un jeton
--     secret, sans connexion ; l'envoi et la confirmation newsletter passent par des
--     fonctions internes réservées aux fonctions Edge (service_role).
--   * Les demandes sont supprimées avec leur session (cascade, donc purge RGPD à 90 jours).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Colonnes ajoutées aux formateurs
--   rapport_autorise : réglable uniquement par l'admin (via admin_autoriser_rapport_formateur)
--   nom : nom affiché dans le rapport (facultatif)
-- -----------------------------------------------------------------------------
alter table public.formateurs
  add column rapport_autorise boolean not null default true,
  add column nom text check (nom is null or char_length(nom) <= 80);

-- -----------------------------------------------------------------------------
-- Validation des liens « Prochaines étapes » (réutilisée partout)
-- Renvoie la liste nettoyée (espaces retirés, seules les 4 clés connues) ou lève
-- une erreur en français. NULL reste NULL (= « hérite »).
-- -----------------------------------------------------------------------------
create or replace function public.valider_liens_suivi(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  lien   jsonb;
  res    jsonb := '[]'::jsonb;
  i      int := 0;
  titre  text;
  texte  text;
  bouton text;
  url    text;
begin
  if p is null then return null; end if;
  if jsonb_typeof(p) <> 'array' then
    raise exception 'La liste des liens est invalide.' using errcode = '22023';
  end if;
  if jsonb_array_length(p) > 5 then
    raise exception 'Tu peux ajouter 5 liens au maximum.' using errcode = '22023';
  end if;
  for lien in select value from jsonb_array_elements(p) loop
    i := i + 1;
    if jsonb_typeof(lien) <> 'object' then
      raise exception 'Lien %: le format est invalide.', i using errcode = '22023';
    end if;
    if coalesce(jsonb_typeof(lien->'titre'), '') <> 'string'
       or coalesce(jsonb_typeof(lien->'url'), '') <> 'string'
       or coalesce(jsonb_typeof(lien->'bouton'), '') <> 'string'
       or coalesce(jsonb_typeof(lien->'texte'), 'string') <> 'string' then
      raise exception 'Lien %: le titre, l''adresse et le texte du bouton sont obligatoires.', i using errcode = '22023';
    end if;
    titre  := btrim(lien->>'titre');
    texte  := btrim(coalesce(lien->>'texte', ''));
    bouton := btrim(lien->>'bouton');
    url    := btrim(lien->>'url');
    if char_length(titre) not between 1 and 80 then
      raise exception 'Lien %: le titre est obligatoire (80 caractères maximum).', i using errcode = '22023';
    end if;
    if char_length(texte) > 200 then
      raise exception 'Lien %: la phrase d''accroche fait 200 caractères maximum.', i using errcode = '22023';
    end if;
    if char_length(bouton) not between 1 and 40 then
      raise exception 'Lien %: le texte du bouton est obligatoire (40 caractères maximum).', i using errcode = '22023';
    end if;
    if char_length(url) > 500 or url !~ '^https://[^[:space:]]{4,}$' then
      raise exception 'Lien %: l''adresse doit commencer par https:// (sans espace).', i using errcode = '22023';
    end if;
    res := res || jsonb_build_array(jsonb_build_object(
      'titre', titre, 'texte', texte, 'url', url, 'bouton', bouton));
  end loop;
  return res;
end $$;
revoke execute on function public.valider_liens_suivi(jsonb) from public, anon, authenticated;

-- Version « oui/non » pour les contraintes CHECK (évaluée avec les droits de l'appelant).
create or replace function public.liens_suivi_valides(p jsonb)
returns boolean language plpgsql immutable security definer set search_path = '' as $$
begin
  perform public.valider_liens_suivi(p);
  return true;
exception when others then
  return false;
end $$;
revoke execute on function public.liens_suivi_valides(jsonb) from public, anon;
grant execute on function public.liens_suivi_valides(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Réglages généraux (une seule ligne) — admin uniquement
-- -----------------------------------------------------------------------------
create table public.parametres_generaux (
  id                  int primary key check (id = 1),
  rapport_actif       boolean not null default false,
  newsletter_active   boolean not null default false,
  liens_suivi         jsonb not null default '[]'
                      check (jsonb_typeof(liens_suivi) = 'array' and public.liens_suivi_valides(liens_suivi)),
  url_confidentialite text check (url_confidentialite is null
                                  or (char_length(url_confidentialite) <= 500
                                      and url_confidentialite ~ '^https://[^[:space:]]{4,}$')),
  maj_le              timestamptz not null default now()
);
insert into public.parametres_generaux (id) values (1);

-- Réglages par quiz — admin uniquement. Pas de ligne = tout hérité.
create table public.reglages_quiz (
  quiz_id      uuid primary key references public.quiz (id) on delete cascade,
  rapport      text not null default 'herite' check (rapport in ('herite', 'actif', 'inactif')),
  newsletter   text not null default 'herite' check (newsletter in ('herite', 'actif', 'inactif')),
  -- NULL = utiliser les liens généraux ; sinon ils les REMPLACENT ('[]' = aucun lien)
  liens_suivi  jsonb check (liens_suivi is null
                            or (jsonb_typeof(liens_suivi) = 'array' and public.liens_suivi_valides(liens_suivi))),
  maj_le       timestamptz not null default now()
);

-- Demandes de rapport : aucune lecture directe par les clients (ni politique, ni droit)
create table public.demandes_rapport (
  id                       uuid primary key default gen_random_uuid(),
  session_id               uuid not null references public.sessions (id) on delete cascade,
  participant_id           uuid not null unique references public.participants (id) on delete cascade,
  email                    text not null check (char_length(email) <= 254),
  jeton_rapport            uuid not null unique default gen_random_uuid(),
  jeton_newsletter         uuid not null unique default gen_random_uuid(),
  envoye_le                timestamptz,
  -- Vrai tant qu'un envoi est autorisé : une demande acceptée = UN email (anti-spam)
  a_envoyer                boolean not null default false,
  derniere_demande_le      timestamptz not null default now(),
  nb_envois                smallint not null default 0 check (nb_envois between 0 and 3),
  newsletter_confirmee_le  timestamptz,
  cree_le                  timestamptz not null default now()
);
create index on public.demandes_rapport (session_id);
create index on public.demandes_rapport (email, derniere_demande_le);

alter table public.parametres_generaux enable row level security;
alter table public.reglages_quiz       enable row level security;
alter table public.demandes_rapport    enable row level security;

create policy "admin lit les paramètres" on public.parametres_generaux
  for select to authenticated using (public.est_admin());
create policy "admin modifie les paramètres" on public.parametres_generaux
  for update to authenticated using (public.est_admin()) with check (public.est_admin());
create policy "admin gère les réglages de quiz" on public.reglages_quiz
  for all to authenticated using (public.est_admin()) with check (public.est_admin());
-- demandes_rapport : volontairement AUCUNE politique.

revoke all on public.parametres_generaux, public.reglages_quiz, public.demandes_rapport from anon, authenticated;
grant select, update on public.parametres_generaux to authenticated;
grant select, insert, update, delete on public.reglages_quiz to authenticated;

-- Maintien de maj_le
create or replace function public.maj_maj_le()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.maj_le := now();
  return new;
end $$;
create trigger parametres_generaux_maj before update on public.parametres_generaux
  for each row execute function public.maj_maj_le();
create trigger reglages_quiz_maj before update on public.reglages_quiz
  for each row execute function public.maj_maj_le();

-- -----------------------------------------------------------------------------
-- Règles effectives d'une session (interne) : l'admin a le dernier mot à chaque niveau
-- -----------------------------------------------------------------------------
create or replace function public.rapport_regles(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s       public.sessions;
  g       public.parametres_generaux;
  autorise boolean;
  rq      public.reglages_quiz;
  propose boolean;
begin
  select * into s from public.sessions where id = p_session;
  select * into g from public.parametres_generaux where id = 1;
  select coalesce(f.rapport_autorise, false) into autorise from public.formateurs f where f.id = s.formateur_id;
  if s.quiz_id is not null then
    select * into rq from public.reglages_quiz where quiz_id = s.quiz_id;
  end if;
  propose := coalesce(g.rapport_actif, false) and coalesce(autorise, false)
             and coalesce(rq.rapport, 'herite') <> 'inactif';
  return jsonb_build_object(
    'propose',             propose,
    'newsletter_proposee', propose and coalesce(g.newsletter_active, false)
                           and coalesce(rq.newsletter, 'herite') <> 'inactif',
    'liens_suivi',         coalesce(rq.liens_suivi, g.liens_suivi, '[]'::jsonb),
    'url_confidentialite', to_jsonb(g.url_confidentialite));
end $$;
revoke execute on function public.rapport_regles(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Participant : demander son rapport
-- -----------------------------------------------------------------------------
create or replace function public.demander_rapport(p_session uuid, p_email text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s     public.sessions;
  moi   public.participants;
  mail  text := lower(btrim(coalesce(p_email, '')));
  d     public.demandes_rapport;
begin
  select * into moi from public.participants where session_id = p_session and utilisateur_id = auth.uid();
  if not found then
    raise exception 'Tu ne participes pas à ce quiz.' using errcode = '42501';
  end if;
  select * into s from public.sessions where id = p_session;
  if s.etat not in ('bilan', 'terminee') then
    raise exception 'Le rapport sera disponible à la fin du quiz.' using errcode = '55000';
  end if;
  if not (public.rapport_regles(s.id)->>'propose')::boolean then
    raise exception 'Le rapport par email n''est pas disponible pour ce quiz.' using errcode = '55000';
  end if;
  if char_length(mail) > 254 or mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:].]{2,}$' then
    raise exception 'Cette adresse email ne semble pas valide. Vérifie-la et réessaie.' using errcode = '22023';
  end if;

  select * into d from public.demandes_rapport where participant_id = moi.id for update;
  if found and d.nb_envois >= 3 then
    raise exception 'Tu as déjà demandé ton rapport plusieurs fois. Regarde dans ta boîte mail (et dans les indésirables).'
      using errcode = '53400';
  end if;

  -- Limites anti-spam : par quiz, puis par adresse (toutes sessions confondues, 24 h)
  if (select count(*) from public.demandes_rapport where session_id = s.id and participant_id <> moi.id) >= 300 then
    raise exception 'Trop de demandes pour ce quiz. Parles-en à ton formateur.' using errcode = '53400';
  end if;
  if (select count(*) from public.demandes_rapport
      where email = mail and participant_id <> moi.id
        and derniere_demande_le > now() - interval '24 hours') >= 5 then
    raise exception 'Trop de demandes pour cette adresse aujourd''hui. Réessaie demain.' using errcode = '53400';
  end if;

  insert into public.demandes_rapport (session_id, participant_id, email, nb_envois, a_envoyer)
  values (s.id, moi.id, mail, 1, true)
  on conflict (participant_id) do update
    set email = excluded.email, nb_envois = public.demandes_rapport.nb_envois + 1,
        a_envoyer = true, derniere_demande_le = now()
  returning * into d;

  return jsonb_build_object('demande_id', d.id);
end $$;
revoke execute on function public.demander_rapport(uuid, text) from public, anon;
grant execute on function public.demander_rapport(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Page du rapport (sans connexion) : le contenu de CE participant uniquement.
-- Seules les questions réellement posées (ouvertes au moins une fois) apparaissent ;
-- la bonne réponse et l'explication seulement si la question est fermée (ou la session
-- arrivée au bilan). Jamais de pseudo ni de réponse d'un autre participant.
-- -----------------------------------------------------------------------------
create or replace function public.rapport_par_jeton(p_jeton uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  d       public.demandes_rapport;
  s       public.sessions;
  moi     public.participants;
  regles  jsonb;
  qs      jsonb;
  nom     text;
begin
  select * into d from public.demandes_rapport where jeton_rapport = p_jeton;
  if not found then
    raise exception 'Ce rapport n''existe plus. Les rapports sont conservés 90 jours.' using errcode = 'P0002';
  end if;
  select * into s from public.sessions where id = d.session_id;
  select * into moi from public.participants where id = d.participant_id;
  select f.nom into nom from public.formateurs f where f.id = s.formateur_id;
  regles := public.rapport_regles(s.id);

  select coalesce(jsonb_agg(jsonb_build_object(
      'ordre',          q.ordre,
      'type',           q.type,
      'enonce',         q.enonce,
      'image_url',      to_jsonb(q.image_question),      -- chemin dans le stockage « quiz-images »
      'choix',          to_jsonb(q.choix),
      'images_choix',   to_jsonb(q.images_choix),
      'mes_reponses',   case
                          when q.type = 'qcm_multiple' then
                            coalesce((select to_jsonb(public.indices_tries(r.valeur))
                                      from public.reponses r
                                      where r.question_id = q.id and r.participant_id = moi.id
                                      order by r.rang limit 1), '[]'::jsonb)
                          else
                            coalesce((select jsonb_agg(r.valeur order by r.rang)
                                      from public.reponses r
                                      where r.question_id = q.id and r.participant_id = moi.id), '[]'::jsonb)
                        end,
      'bonnes_reponses', case
                           when q.fermee_le is null and s.etat not in ('bilan', 'terminee') then null
                           when q.type = 'qcm' then jsonb_build_array(q.bonne_reponse)
                           when q.type = 'qcm_multiple' then to_jsonb(public.indices_tries(q.bonnes_reponses))
                         end,
      'explication',    case when q.fermee_le is not null or s.etat in ('bilan', 'terminee')
                             then to_jsonb(q.explication) end,
      'etapes',         case when q.type = 'atelier' then
                          coalesce((select jsonb_agg(jsonb_build_object('titre', e.titre, 'mon_rendu', to_jsonb(ra.texte))
                                                     order by e.ordre)
                                    from public.etapes_session e
                                    left join public.rendus_atelier ra
                                           on ra.etape_id = e.id and ra.participant_id = moi.id
                                    where e.question_id = q.id), '[]'::jsonb)
                        end
    ) order by q.ordre), '[]'::jsonb)
  into qs
  from public.questions_session q
  where q.session_id = s.id and q.ouverte_le is not null;

  return jsonb_build_object(
    'quiz_titre',          s.titre,
    'date',                s.cree_le,
    'formateur_nom',       to_jsonb(nom),
    'pseudo',              moi.pseudo,
    'questions',           qs,
    'liens_suivi',         regles->'liens_suivi',
    'newsletter_proposee', (regles->>'newsletter_proposee')::boolean,
    'jeton_newsletter',    case when (regles->>'newsletter_proposee')::boolean
                                 and d.newsletter_confirmee_le is null
                                then to_jsonb(d.jeton_newsletter) end,
    'newsletter_confirmee', d.newsletter_confirmee_le is not null,
    'url_confidentialite', regles->'url_confidentialite');
end $$;
revoke execute on function public.rapport_par_jeton(uuid) from public;
grant execute on function public.rapport_par_jeton(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Fonctions internes (service_role uniquement : fonctions Edge)
-- -----------------------------------------------------------------------------
create or replace function public.rapport_pour_envoi(p_demande uuid, p_utilisateur uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  d       public.demandes_rapport;
  s       public.sessions;
  moi     public.participants;
  regles  jsonb;
  nom     text;
begin
  select dr.* into d
  from public.demandes_rapport dr
  join public.participants p on p.id = dr.participant_id
  where dr.id = p_demande and p.utilisateur_id = p_utilisateur;
  if not found then
    raise exception 'Cette demande de rapport est introuvable.' using errcode = 'P0002';
  end if;
  if not d.a_envoyer then
    raise exception 'Ce rapport a déjà été envoyé.' using errcode = '55000';
  end if;
  select * into s from public.sessions where id = d.session_id;
  select * into moi from public.participants where id = d.participant_id;
  select f.nom into nom from public.formateurs f where f.id = s.formateur_id;
  regles := public.rapport_regles(s.id);

  return jsonb_build_object(
    'email',               d.email,
    'jeton_rapport',       d.jeton_rapport,
    'quiz_titre',          s.titre,
    'date',                s.cree_le,
    'formateur_nom',       to_jsonb(nom),
    'pseudo',              moi.pseudo,
    'nb_questions',        (select count(*) from public.questions_session
                            where session_id = s.id and ouverte_le is not null),
    'nb_bonnes',           (select count(*) from public.reponses r
                            join public.questions_session q on q.id = r.question_id
                            where r.participant_id = moi.id and q.type in ('qcm', 'qcm_multiple')
                              and r.est_correcte),
    'liens_suivi',         regles->'liens_suivi',
    'newsletter_proposee', (regles->>'newsletter_proposee')::boolean,
    'jeton_newsletter',    case when (regles->>'newsletter_proposee')::boolean
                                 and d.newsletter_confirmee_le is null
                                then to_jsonb(d.jeton_newsletter) end,
    'url_confidentialite', regles->'url_confidentialite');
end $$;

create or replace function public.rapport_marquer_envoye(p_demande uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.demandes_rapport set envoye_le = now(), a_envoyer = false where id = p_demande;
end $$;

create or replace function public.newsletter_confirmer(p_jeton uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  d  public.demandes_rapport;
begin
  select * into d from public.demandes_rapport where jeton_newsletter = p_jeton for update;
  if not found or not (public.rapport_regles(d.session_id)->>'newsletter_proposee')::boolean then
    raise exception 'Ce lien n''est plus valide.' using errcode = 'P0002';
  end if;
  if d.newsletter_confirmee_le is not null then
    return jsonb_build_object('email', d.email, 'deja_confirmee', true);
  end if;
  update public.demandes_rapport set newsletter_confirmee_le = now() where id = d.id;
  return jsonb_build_object('email', d.email, 'deja_confirmee', false);
end $$;

revoke execute on function public.rapport_pour_envoi(uuid, uuid), public.rapport_marquer_envoye(uuid),
  public.newsletter_confirmer(uuid) from public, anon, authenticated;
-- Sur Supabase le rôle service_role existe ; en local (tests) il peut être absent.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.rapport_pour_envoi(uuid, uuid), public.rapport_marquer_envoye(uuid),
      public.newsletter_confirmer(uuid), public.rapport_regles(uuid) to service_role;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Administration
-- -----------------------------------------------------------------------------
create or replace function public.admin_lire_parametres()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare g public.parametres_generaux;
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''administration.' using errcode = '42501';
  end if;
  select * into g from public.parametres_generaux where id = 1;
  return jsonb_build_object(
    'rapport_actif',       g.rapport_actif,
    'newsletter_active',   g.newsletter_active,
    'liens_suivi',         g.liens_suivi,
    'url_confidentialite', to_jsonb(g.url_confidentialite));
end $$;

create or replace function public.admin_modifier_parametres(
  p_rapport_actif boolean, p_newsletter_active boolean, p_liens jsonb, p_url_confidentialite text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  url text := nullif(btrim(coalesce(p_url_confidentialite, '')), '');
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''administration.' using errcode = '42501';
  end if;
  if url is not null and (char_length(url) > 500 or url !~ '^https://[^[:space:]]{4,}$') then
    raise exception 'L''adresse de la politique de confidentialité doit commencer par https://.' using errcode = '22023';
  end if;
  update public.parametres_generaux
     set rapport_actif = coalesce(p_rapport_actif, false),
         newsletter_active = coalesce(p_newsletter_active, false),
         liens_suivi = coalesce(public.valider_liens_suivi(p_liens), '[]'::jsonb),
         url_confidentialite = url
   where id = 1;
  return public.admin_lire_parametres();
end $$;

create or replace function public.admin_lire_reglages_quiz(p_quiz uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  rq public.reglages_quiz;
  g  public.parametres_generaux;
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''administration.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.quiz where id = p_quiz) then
    raise exception 'Ce quiz est introuvable.' using errcode = 'P0002';
  end if;
  select * into rq from public.reglages_quiz where quiz_id = p_quiz;
  select * into g from public.parametres_generaux where id = 1;
  return jsonb_build_object(
    'rapport',         coalesce(rq.rapport, 'herite'),
    'newsletter',      coalesce(rq.newsletter, 'herite'),
    'liens_suivi',     to_jsonb(rq.liens_suivi),
    'liens_generaux',  g.liens_suivi);
end $$;

create or replace function public.admin_modifier_reglages_quiz(
  p_quiz uuid, p_rapport text, p_newsletter text, p_liens jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''administration.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.quiz where id = p_quiz) then
    raise exception 'Ce quiz est introuvable.' using errcode = 'P0002';
  end if;
  if p_rapport not in ('herite', 'actif', 'inactif') or p_newsletter not in ('herite', 'actif', 'inactif') then
    raise exception 'Choisis « hérité », « activé » ou « désactivé ».' using errcode = '22023';
  end if;
  insert into public.reglages_quiz (quiz_id, rapport, newsletter, liens_suivi)
  values (p_quiz, p_rapport, p_newsletter, public.valider_liens_suivi(p_liens))
  on conflict (quiz_id) do update
    set rapport = excluded.rapport, newsletter = excluded.newsletter, liens_suivi = excluded.liens_suivi;
  return public.admin_lire_reglages_quiz(p_quiz);
end $$;

create or replace function public.admin_autoriser_rapport_formateur(p_formateur uuid, p_autorise boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''administration.' using errcode = '42501';
  end if;
  update public.formateurs set rapport_autorise = coalesce(p_autorise, false) where id = p_formateur;
  if not found then
    raise exception 'Ce formateur est introuvable.' using errcode = 'P0002';
  end if;
end $$;

revoke execute on function public.admin_lire_parametres(), public.admin_modifier_parametres(boolean, boolean, jsonb, text),
  public.admin_lire_reglages_quiz(uuid), public.admin_modifier_reglages_quiz(uuid, text, text, jsonb),
  public.admin_autoriser_rapport_formateur(uuid, boolean) from public, anon;
grant execute on function public.admin_lire_parametres(), public.admin_modifier_parametres(boolean, boolean, jsonb, text),
  public.admin_lire_reglages_quiz(uuid), public.admin_modifier_reglages_quiz(uuid, text, text, jsonb),
  public.admin_autoriser_rapport_formateur(uuid, boolean) to authenticated;

-- admin_liste_formateurs : ajoute rapport_autorise (le type de retour change : on la recrée)
drop function public.admin_liste_formateurs();
create function public.admin_liste_formateurs()
returns table (id uuid, email text, est_admin boolean, actif boolean, nb_quiz bigint, derniere_session timestamptz,
               rapport_autorise boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Réservé aux administrateurs.' using errcode = '42501';
  end if;
  return query
    select f.id, f.email, f.est_admin, f.actif,
           (select count(*) from public.quiz z where z.formateur_id = f.id),
           (select max(j.cree_le) from public.journal_usage j where j.formateur_id = f.id and j.type = 'session'),
           f.rapport_autorise
    from public.formateurs f
    order by f.actif desc, f.email;
end $$;
revoke execute on function public.admin_liste_formateurs() from public, anon;
grant execute on function public.admin_liste_formateurs() to authenticated;

-- -----------------------------------------------------------------------------
-- etat_session : dernière définition (20261124000020) + bloc « rapport » en fin de quiz
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

  -- Rapport par email : seulement pour le participant, en fin de quiz (jamais pour le formateur).
  if s.etat in ('bilan', 'terminee') and not formateur then
    resultat := resultat || jsonb_build_object('rapport', (
      select jsonb_build_object(
        'propose',              (g.regles->>'propose')::boolean,
        'newsletter_proposee',  (g.regles->>'newsletter_proposee')::boolean,
        'url_confidentialite',  g.regles->'url_confidentialite',
        'deja_demande',         d.id is not null,
        'email_masque',         case when d.id is null then null
                                     else left(d.email, 1) || '***' || substr(d.email, position('@' in d.email)) end)
      from (select public.rapport_regles(s.id) as regles) g
      left join public.demandes_rapport d on d.participant_id = moi.id));
  end if;

  return resultat;
end $$;

revoke execute on function public.etat_session(uuid, text) from public, anon;
grant execute on function public.etat_session(uuid, text) to authenticated;
