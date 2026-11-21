-- =============================================================================
-- Droits d'accès aux tables (les projets Supabase récents ne les donnent plus
-- automatiquement). Ces droits ouvrent la porte ; la RLS décide ensuite, ligne
-- par ligne, ce que chacun voit. Les visiteurs non connectés (anon) n'ont rien.
-- =============================================================================
grant select on public.formateurs to authenticated;
grant select, insert, update, delete on public.quiz, public.questions to authenticated;
grant select on public.sessions, public.questions_session, public.tables_salle,
                public.participants, public.reponses, public.mentions to authenticated;
