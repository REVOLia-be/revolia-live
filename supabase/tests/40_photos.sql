-- Questions avec photos
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
insert into public.quiz (id, formateur_id, titre) values ('40000000-0000-0000-0000-000000000001', auth.uid(), 'Quiz photos');
-- Photo seule, sans énoncé texte
insert into public.questions (quiz_id, ordre, type, enonce, choix, bonne_reponse, image_question) values
  ('40000000-0000-0000-0000-000000000001', 1, 'qcm', '', '{A,B}', 0, '00000000-0000-0000-0000-00000000000f/11111111-1111-1111-1111-111111111111.webp');
-- Propositions en photos
insert into public.questions (quiz_id, ordre, type, enonce, choix, bonne_reponse, images_choix) values
  ('40000000-0000-0000-0000-000000000001', 2, 'qcm', 'Laquelle ?', '{"",""}', 1,
   '{00000000-0000-0000-0000-00000000000f/22222222-2222-2222-2222-222222222222.jpg,00000000-0000-0000-0000-00000000000f/33333333-3333-3333-3333-333333333333.png}');
select test.doit_echouer($$insert into public.questions (quiz_id, ordre, type, enonce, choix, bonne_reponse) values ('40000000-0000-0000-0000-000000000001', 3, 'qcm', '  ', '{A,B}', 0)$$, 'questions_enonce_check');
select test.doit_echouer($$insert into public.questions (quiz_id, ordre, type, enonce, choix, bonne_reponse, image_question) values ('40000000-0000-0000-0000-000000000001', 3, 'qcm', 'x', '{A,B}', 0, 'https://pisteur.example/espion.png')$$, 'questions_image_valide');
select test.doit_echouer($$insert into public.questions (quiz_id, ordre, type, enonce, choix, bonne_reponse, images_choix) values ('40000000-0000-0000-0000-000000000001', 3, 'qcm', 'x', '{A,B,C}', 0, '{00000000-0000-0000-0000-00000000000f/22222222-2222-2222-2222-222222222222.jpg}')$$, 'questions_images_choix_valides');
select test.doit_echouer($$insert into public.questions (quiz_id, ordre, type, enonce, images_choix) values ('40000000-0000-0000-0000-000000000001', 3, 'nuage', 'x', '{00000000-0000-0000-0000-00000000000f/22222222-2222-2222-2222-222222222222.jpg}')$$, 'questions_images_choix_valides');
select set_config('test.s4', public.lancer_session('40000000-0000-0000-0000-000000000001')->>'session_id', false);
select public.ouvrir_question(current_setting('test.s4')::uuid);
select test.verifier(public.etat_session(current_setting('test.s4')::uuid)->'question'->>'image' like '%1111.webp', 'la photo de la question est transmise');
select public.ouvrir_question(current_setting('test.s4')::uuid);
select test.verifier(jsonb_array_length(public.etat_session(current_setting('test.s4')::uuid)->'question'->'images_choix') = 2, 'les photos des propositions sont transmises');
reset role;
