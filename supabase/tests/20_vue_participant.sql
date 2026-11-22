-- Un formateur qui rejoint son propre quiz comme participant (même navigateur)
-- doit voir, en vue « participant », sa réponse et son score.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
insert into public.quiz (id, formateur_id, titre) values ('20000000-0000-0000-0000-000000000001', auth.uid(), 'Quiz vue');
insert into public.questions (quiz_id, ordre, type, enonce, choix, bonne_reponse) values
  ('20000000-0000-0000-0000-000000000001', 1, 'qcm', 'V1', '{A,B}', 0);
select set_config('test.s2', public.lancer_session('20000000-0000-0000-0000-000000000001')->>'session_id', false);
select public.rejoindre_session((select code from public.sessions where id = current_setting('test.s2')::uuid), 'JF');
select public.ouvrir_question(current_setting('test.s2')::uuid);
select public.repondre((select question_courante_id from public.sessions where id = current_setting('test.s2')::uuid), '0');
select public.fermer_question(current_setting('test.s2')::uuid);
select test.verifier(public.etat_session(current_setting('test.s2')::uuid)->'resultats'->'ma_reponse' is null, 'vue formateur par défaut : pas de ma_reponse');
select test.verifier((public.etat_session(current_setting('test.s2')::uuid, 'participant')->'resultats'->>'ma_reponse') = '0', 'vue participant : sa réponse est renvoyée');
select test.verifier((public.etat_session(current_setting('test.s2')::uuid, 'participant')->'resultats'->>'est_correcte')::boolean, 'vue participant : juste');
select test.verifier(public.etat_session(current_setting('test.s2')::uuid)->>'celebration' = 'Bravo à toute la salle !', 'célébration automatique à 100 % de réussite');
reset role;
-- Un connecté sans fiche participant ne gagne rien avec la vue participant
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ff', false);
set role authenticated;
select test.doit_echouer(format('select public.etat_session(%L, %L)', current_setting('test.s2'), 'participant'), 'ne participes pas');
reset role;
