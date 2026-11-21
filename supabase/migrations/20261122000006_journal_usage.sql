-- =============================================================================
-- Suivi d'utilisation, très simple : une ligne par session lancée et une ligne
-- par génération de questions (PDF/texte). Aucune donnée personnelle : seulement
-- des dates et des nombres. Ces lignes NE sont PAS supprimées par la purge RGPD
-- des sessions (pas de lien en cascade), pour garder l'historique.
-- =============================================================================
create table public.journal_usage (
  id               uuid primary key default gen_random_uuid(),
  formateur_id     uuid not null references public.formateurs (id) on delete cascade,
  type             text not null check (type in ('session', 'generation')),
  session_id       uuid unique,      -- volontairement sans clé étrangère (survit à la purge)
  quiz_titre       text,
  nb_questions     int,
  nb_participants  int,
  nb_reponses      int,
  tokens_entree    int,
  tokens_sortie    int,
  cree_le          timestamptz not null default now()
);
create index on public.journal_usage (formateur_id, cree_le desc);

alter table public.journal_usage enable row level security;
create policy "formateur lit son journal" on public.journal_usage
  for select to authenticated using (formateur_id = auth.uid());
grant select on public.journal_usage to authenticated;

-- Une ligne à chaque session lancée, complétée quand la session passe au bilan.
create or replace function public.journaliser_session()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.journal_usage (formateur_id, type, session_id, quiz_titre)
    values (new.formateur_id, 'session', new.id, new.titre);
  elsif new.etat in ('bilan', 'terminee') then
    update public.journal_usage set
      nb_questions    = (select count(*) from public.questions_session where session_id = new.id and ouverte_le is not null),
      nb_participants = (select count(*) from public.participants where session_id = new.id),
      nb_reponses     = (select count(*) from public.reponses where session_id = new.id)
    where session_id = new.id;
  end if;
  return new;
end $$;

create trigger sessions_journal_insert after insert on public.sessions
  for each row execute function public.journaliser_session();
create trigger sessions_journal_bilan after update of etat on public.sessions
  for each row when (new.etat in ('bilan', 'terminee') and old.etat is distinct from new.etat)
  execute function public.journaliser_session();

-- Appelée par l'éditeur après une génération réussie (avec les jetons consommés).
create or replace function public.journaliser_generation(p_tokens_entree int, p_tokens_sortie int)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.est_formateur() then
    raise exception 'Réservé aux formateurs.' using errcode = '42501';
  end if;
  insert into public.journal_usage (formateur_id, type, tokens_entree, tokens_sortie)
  values (auth.uid(), 'generation', greatest(0, p_tokens_entree), greatest(0, p_tokens_sortie));
end $$;

revoke execute on function public.journaliser_session() from public, anon, authenticated;
revoke execute on function public.journaliser_generation(int, int) from public, anon;
grant execute on function public.journaliser_generation(int, int) to authenticated;

-- Reprise de l'historique déjà présent (sessions de test comprises).
insert into public.journal_usage (formateur_id, type, session_id, quiz_titre, nb_questions, nb_participants, nb_reponses, cree_le)
select s.formateur_id, 'session', s.id, s.titre,
       (select count(*) from public.questions_session q where q.session_id = s.id and q.ouverte_le is not null),
       (select count(*) from public.participants p where p.session_id = s.id),
       (select count(*) from public.reponses r where r.session_id = s.id),
       s.cree_le
from public.sessions s
on conflict (session_id) do nothing;
