-- Ateliers à son rythme : contraintes, lancement, parcours des participants, confidentialité.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', null, true),
  ('00000000-0000-0000-0000-00000000000b', null, true),
  ('00000000-0000-0000-0000-0000000000ff', 'intrus@exemple.be', false)
on conflict do nothing;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;

-- ===== Préparation : une question QCM puis un atelier de 3 étapes =====
insert into public.quiz (id, formateur_id, titre) values ('50000000-0000-0000-0000-000000000001', auth.uid(), 'Quiz atelier');
insert into public.questions (id, quiz_id, ordre, type, enonce, choix, bonne_reponse) values
  ('50000000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-000000000001', 1, 'qcm', 'Échauffement', '{A,B}', 0);
insert into public.questions (id, quiz_id, ordre, type, enonce, explication) values
  ('50000000-0000-0000-0000-0000000000a2', '50000000-0000-0000-0000-000000000001', 2, 'atelier', 'Atelier prompts', 'Consigne générale');
insert into public.etapes_atelier (id, question_id, ordre, titre, consigne, fichiers, liens, prompts, rendu_attendu) values
  ('50000000-0000-0000-0000-0000000000b1', '50000000-0000-0000-0000-0000000000a2', 1, 'Lire', 'Lis **bien**.',
   '[{"chemin":"00000000-0000-0000-0000-00000000000f/11111111-1111-1111-1111-111111111111.docx","nom":"Modèle.docx","taille":12345}]',
   '[{"url":"https://exemple.be/aide","libelle":"Aide"}]',
   '[{"titre":"Premier prompt","texte":"Bonjour, résume ce texte."}]', false),
  ('50000000-0000-0000-0000-0000000000b2', '50000000-0000-0000-0000-0000000000a2', 2, 'Essayer', '', '[]', '[]', '[]', true),
  ('50000000-0000-0000-0000-0000000000b3', '50000000-0000-0000-0000-0000000000a2', 3, 'Conclure', '', '[]', '[]', '[]', false);
reset role;
select test.verifier(public.poids_max_question('atelier') = 0 and public.poids_max_question('qcm') = 2, 'un atelier pèse 0 dans la jauge');
set role authenticated;

-- ===== Contraintes =====
select test.doit_echouer($$insert into public.questions (quiz_id, ordre, type, enonce, choix) values ('50000000-0000-0000-0000-000000000001', 9, 'atelier', 'X', '{A,B}')$$, 'qcm_coherent');
select test.doit_echouer($$insert into public.questions (quiz_id, ordre, type, enonce) values ('50000000-0000-0000-0000-000000000001', 9, 'atelier', '  ')$$, 'qcm_coherent');
select test.doit_echouer($$insert into public.etapes_atelier (question_id, ordre, titre) values ('50000000-0000-0000-0000-0000000000a1', 1, 'Sur un QCM')$$, 'type atelier');
select test.doit_echouer($$insert into public.etapes_atelier (question_id, ordre, titre) values ('50000000-0000-0000-0000-0000000000a2', 9, '')$$, 'etapes_atelier_titre_check');
select test.doit_echouer($$insert into public.etapes_atelier (question_id, ordre, titre, fichiers) values ('50000000-0000-0000-0000-0000000000a2', 9, 'x', '{"a":1}')$$, 'etapes_atelier_fichiers_valides');
select test.doit_echouer($$insert into public.etapes_atelier (question_id, ordre, titre, fichiers) values ('50000000-0000-0000-0000-0000000000a2', 9, 'x',
  '[{"chemin":"https://pisteur.example/y.pdf","nom":"Y.pdf","taille":1}]')$$, 'etapes_atelier_fichiers_valides');
select test.doit_echouer($$insert into public.etapes_atelier (question_id, ordre, titre, fichiers) values ('50000000-0000-0000-0000-0000000000a2', 9, 'x',
  '[{"chemin":"00000000-0000-0000-0000-00000000000f/11111111-1111-1111-1111-111111111111.exe","nom":"Y.exe","taille":1}]')$$, 'etapes_atelier_fichiers_valides');
select test.doit_echouer($$insert into public.etapes_atelier (question_id, ordre, titre, fichiers) values ('50000000-0000-0000-0000-0000000000a2', 9, 'x',
  '[{"chemin":"00000000-0000-0000-0000-00000000000f/11111111-1111-1111-1111-111111111111.pdf","nom":"Y.pdf","taille":-1}]')$$, 'etapes_atelier_fichiers_valides');
select test.doit_echouer(format($f$insert into public.etapes_atelier (question_id, ordre, titre, fichiers) values ('50000000-0000-0000-0000-0000000000a2', 9, 'x', %L)$f$,
  (select jsonb_agg(jsonb_build_object('chemin','00000000-0000-0000-0000-00000000000f/11111111-1111-1111-1111-111111111111.pdf','nom','Y.pdf','taille',1)) from generate_series(1, 11))), 'etapes_atelier_fichiers_valides');
select test.doit_echouer($$insert into public.etapes_atelier (question_id, ordre, titre, liens) values ('50000000-0000-0000-0000-0000000000a2', 9, 'x', '[{"url":"http://exemple.be","libelle":"Non sécurisé"}]')$$, 'etapes_atelier_liens_valides');
select test.doit_echouer($$insert into public.etapes_atelier (question_id, ordre, titre, liens) values ('50000000-0000-0000-0000-0000000000a2', 9, 'x', '[{"url":"https://exemple.be"}]')$$, 'etapes_atelier_liens_valides');
select test.doit_echouer($$insert into public.etapes_atelier (question_id, ordre, titre, liens) values ('50000000-0000-0000-0000-0000000000a2', 9, 'x', '"https://exemple.be"')$$, 'etapes_atelier_liens_valides');
select test.doit_echouer($$insert into public.etapes_atelier (question_id, ordre, titre, prompts) values ('50000000-0000-0000-0000-0000000000a2', 9, 'x', '[{"titre":"Sans texte"}]')$$, 'etapes_atelier_prompts_valides');
select test.doit_echouer(format($f$insert into public.etapes_atelier (question_id, ordre, titre, prompts) values ('50000000-0000-0000-0000-0000000000a2', 9, 'x', %L)$f$,
  jsonb_build_array(jsonb_build_object('titre', 'Long', 'texte', repeat('x', 4001)))), 'etapes_atelier_prompts_valides');
select test.doit_echouer($$update public.questions set type = 'ouverte' where id = '50000000-0000-0000-0000-0000000000a2'$$, 'Supprime d''abord les étapes');
select test.verifier((select count(*) from public.etapes_atelier where question_id = '50000000-0000-0000-0000-0000000000a2') = 3, 'les étapes valides sont enregistrées');

-- Un atelier sans étape ne se lance pas
insert into public.quiz (id, formateur_id, titre) values ('50000000-0000-0000-0000-000000000002', auth.uid(), 'Atelier vide');
insert into public.questions (quiz_id, ordre, type, enonce) values ('50000000-0000-0000-0000-000000000002', 1, 'atelier', 'Atelier vide');
select test.doit_echouer($$select public.lancer_session('50000000-0000-0000-0000-000000000002')$$, 'aucune étape');

-- ===== Lancement : les étapes sont copiées =====
select set_config('test.s5', public.lancer_session('50000000-0000-0000-0000-000000000001')->>'session_id', false);
select test.verifier((select count(*) from public.etapes_session where session_id = current_setting('test.s5')::uuid) = 3, 'le lancement copie les 3 étapes');
select test.verifier((select count(*) from public.etapes_session e join public.questions_session q on q.id = e.question_id
                      where e.session_id = current_setting('test.s5')::uuid and q.type = 'atelier' and q.ordre = 2) = 3, 'les étapes sont rattachées à la question de session');
select set_config('test.e1', (select id::text from public.etapes_session where session_id = current_setting('test.s5')::uuid and ordre = 1), false);
select set_config('test.e2', (select id::text from public.etapes_session where session_id = current_setting('test.s5')::uuid and ordre = 2), false);
reset role;

-- Deux participants rejoignent
select set_config('test.code', (select code from public.sessions where id = current_setting('test.s5')::uuid), false);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
set role authenticated;
select public.rejoindre_session(current_setting('test.code'), 'Alice');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
set role authenticated;
select public.rejoindre_session(current_setting('test.code'), 'Bob');
reset role;
select set_config('test.pa', (select id::text from public.participants where pseudo = 'Alice' and session_id = current_setting('test.s5')::uuid), false);
select set_config('test.pb', (select id::text from public.participants where pseudo = 'Bob' and session_id = current_setting('test.s5')::uuid), false);

-- Formateur : QCM puis atelier
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select public.ouvrir_question(current_setting('test.s5')::uuid);
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
set role authenticated;
select public.repondre((select question_courante_id from public.sessions where id = current_setting('test.s5')::uuid), '0');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select public.fermer_question(current_setting('test.s5')::uuid);
select set_config('test.jauge_avant', public.etat_session(current_setting('test.s5')::uuid)->>'jauge', false);

-- Ouverture de l'atelier
select public.ouvrir_question(current_setting('test.s5')::uuid);
select set_config('test.qat', (select question_courante_id::text from public.sessions where id = current_setting('test.s5')::uuid), false);
select test.verifier((select fin_reponses_le is null from public.sessions where id = current_setting('test.s5')::uuid), 'atelier ouvert : pas de fin_reponses_le');
select test.verifier(public.etat_session(current_setting('test.s5')::uuid)->'question'->'fin_reponses_le' = 'null'::jsonb, 'etat_session : fin_reponses_le null');
select test.verifier(jsonb_array_length(public.etat_session(current_setting('test.s5')::uuid)->'question'->'etapes') = 3, 'etat_session contient les 3 étapes');
select test.verifier(public.etat_session(current_setting('test.s5')::uuid)->'question'->'etapes'->0->>'titre' = 'Lire', 'étapes dans l''ordre');
select test.verifier(public.etat_session(current_setting('test.s5')::uuid)->'question'->'etapes'->0->'prompts'->0->>'titre' = 'Premier prompt', 'les prompts sont transmis');
select test.verifier(public.etat_session(current_setting('test.s5')::uuid)->'question'->>'explication' = 'Consigne générale', 'consigne générale transmise');
select test.verifier(public.etat_session(current_setting('test.s5')::uuid)->'atelier' = '{"repartition":[2,0,0],"ont_termine":0,"nb_bloques":0}'::jsonb, 'au départ tout le monde est à l''étape 1');
select test.verifier(public.etat_session(current_setting('test.s5')::uuid)->'rendu_projete' = 'null'::jsonb, 'aucun rendu projeté au départ');
reset role;

-- ===== Alice avance, rend, termine =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
set role authenticated;
select public.atelier_aller_a(current_setting('test.qat')::uuid, 2);
select public.atelier_rendre(current_setting('test.e2')::uuid, '  Mon prompt perso  ');
select test.doit_echouer($$select public.atelier_rendre(current_setting('test.e1')::uuid, 'x')$$, 'ne demande pas de rendu');
select test.doit_echouer($$select public.atelier_rendre(current_setting('test.e2')::uuid, '   ')$$, 'entre 1 et 5000');
select test.doit_echouer(format($f$select public.atelier_rendre(current_setting('test.e2')::uuid, %L)$f$, repeat('x', 5001)), 'entre 1 et 5000');
select test.doit_echouer(format('select public.atelier_aller_a(%L, 5)', current_setting('test.qat')), 'n''existe pas');
select test.doit_echouer(format('select public.atelier_aller_a(%L, 0)', current_setting('test.qat')), 'n''existe pas');
select test.doit_echouer(format('select public.repondre(%L, %L)', current_setting('test.qat'), '"x"'), 'à ton rythme');
select public.atelier_rendre(current_setting('test.e2')::uuid, 'Mon prompt perso (corrigé)');
select public.atelier_aller_a(current_setting('test.qat')::uuid, 4);
select test.verifier((public.etat_session(current_setting('test.s5')::uuid)->'ma_progression'->>'termine')::boolean, 'Alice a terminé');
select test.verifier(public.etat_session(current_setting('test.s5')::uuid)->'mes_rendus'->>current_setting('test.e2') = 'Mon prompt perso (corrigé)', 'mes_rendus contient son rendu (mis à jour)');
reset role;

-- ===== Bob avance, rend et se bloque =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
set role authenticated;
select public.atelier_aller_a(current_setting('test.qat')::uuid, 2);
select public.atelier_rendre(current_setting('test.e2')::uuid, 'Rendu secret');
select public.atelier_bloque(current_setting('test.qat')::uuid, true);
select test.verifier((public.etat_session(current_setting('test.s5')::uuid)->'ma_progression'->>'bloque')::boolean, 'Bob est bloqué');
-- Confidentialité : Bob ne voit ni la progression ni les rendus d'Alice, ni leurs pseudos
select test.verifier((select count(*) from public.progression_atelier) = 1 and (select count(*) from public.progression_atelier where participant_id = current_setting('test.pb')::uuid) = 1, 'Bob ne lit que sa progression');
select test.verifier((select count(*) from public.rendus_atelier) = 1 and (select texte from public.rendus_atelier) = 'Rendu secret', 'Bob ne lit que son rendu');
select test.verifier((select count(*) from public.participants) = 1, 'Bob ne lit pas les pseudos des autres');
select test.verifier((select count(*) from public.etapes_session) = 3, 'Bob lit les étapes (contenu non secret)');
select test.verifier(public.etat_session(current_setting('test.s5')::uuid)::text not like '%Alice%', 'etat_session de Bob ne contient pas le pseudo d''Alice');
select test.doit_echouer($$select public.atelier_suivi(current_setting('test.s5')::uuid)$$, 'n''animes pas');
select test.doit_echouer(format('select public.atelier_resolu(%L)', current_setting('test.pb')), 'n''animes pas');
select test.doit_echouer(format('select public.atelier_en_route(%L)', current_setting('test.pb')), 'n''animes pas');
select test.doit_echouer(format('select public.projeter_rendu(%L, null)', current_setting('test.s5')), 'n''animes pas');
select test.doit_echouer($$insert into public.progression_atelier (session_id, question_id, participant_id) values (current_setting('test.s5')::uuid, current_setting('test.qat')::uuid, current_setting('test.pb')::uuid)$$, 'permission denied');
select test.doit_echouer($$update public.rendus_atelier set texte = 'triche'$$, 'permission denied');
reset role;

-- Un intrus connecté (non participant) ne peut rien faire
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ff', false);
set role authenticated;
select test.doit_echouer(format('select public.atelier_aller_a(%L, 1)', current_setting('test.qat')), 'ne participes pas');
select test.doit_echouer($$select public.atelier_rendre(current_setting('test.e2')::uuid, 'x')$$, 'ne participes pas');
select test.verifier((select count(*) from public.rendus_atelier) = 0 and (select count(*) from public.etapes_session) = 0, 'un intrus ne lit rien');
reset role;

-- ===== Chiffres collectifs, vus par tout le monde =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select test.verifier(public.etat_session(current_setting('test.s5')::uuid)->'atelier' = '{"repartition":[0,1,0],"ont_termine":1,"nb_bloques":1}'::jsonb, 'répartition [0,1,0], 1 a terminé, 1 bloqué');
select test.verifier(public.etat_session(current_setting('test.s5')::uuid)::text not like '%Alice%' and public.etat_session(current_setting('test.s5')::uuid)::text not like '%Bob%', 'la vue formateur d''etat_session n''expose aucun pseudo');
select test.verifier(public.etat_session(current_setting('test.s5')::uuid)->'ma_progression' is null, 'pas de ma_progression en vue formateur');

-- Suivi formateur : avec pseudos
select test.verifier(jsonb_array_length(public.atelier_suivi(current_setting('test.s5')::uuid)->'participants') = 2, 'suivi : 2 participants');
select test.verifier((select p->>'pseudo' from jsonb_array_elements(public.atelier_suivi(current_setting('test.s5')::uuid)->'participants') p
                      where (p->>'termine')::boolean) = 'Alice', 'suivi : Alice a terminé (avec pseudo)');
select test.verifier((select p->>'bloque_depuis' is not null from jsonb_array_elements(public.atelier_suivi(current_setting('test.s5')::uuid)->'participants') p
                      where p->>'pseudo' = 'Bob'), 'suivi : Bob est bloqué');
select test.verifier(jsonb_array_length(public.atelier_suivi(current_setting('test.s5')::uuid)->'rendus') = 2
                     and public.atelier_suivi(current_setting('test.s5')::uuid)->'etapes'->1->>'titre' = 'Essayer', 'suivi : 2 rendus avec pseudos, étapes présentes');
select test.verifier((select count(*) from public.rendus_atelier) = 2 and (select count(*) from public.progression_atelier) = 2, 'le formateur lit tous les rendus et la progression');

-- J'arrive / Résolu
select public.atelier_en_route(current_setting('test.pb')::uuid);
select test.verifier((select en_route from public.progression_atelier where participant_id = current_setting('test.pb')::uuid), 'J''arrive');
select test.doit_echouer(format('select public.atelier_en_route(%L)', current_setting('test.pa')), 'ne demande plus');
select public.atelier_resolu(current_setting('test.pb')::uuid);
select test.verifier((select bloque_depuis is null and not en_route from public.progression_atelier where participant_id = current_setting('test.pb')::uuid), 'Résolu');
select test.verifier((public.etat_session(current_setting('test.s5')::uuid)->'atelier'->>'nb_bloques')::int = 0, 'plus aucun bloqué');

-- Projection d'un rendu : sans pseudo
select set_config('test.rendu_alice', (select r.id::text from public.rendus_atelier r where r.participant_id = current_setting('test.pa')::uuid), false);
select test.doit_echouer($$select public.projeter_rendu(current_setting('test.s5')::uuid, gen_random_uuid())$$, 'introuvable');
select public.projeter_rendu(current_setting('test.s5')::uuid, current_setting('test.rendu_alice')::uuid);
select test.verifier(public.etat_session(current_setting('test.s5')::uuid)->'rendu_projete'->>'texte' = 'Mon prompt perso (corrigé)'
                     and public.etat_session(current_setting('test.s5')::uuid)->'rendu_projete'->>'etape_titre' = 'Essayer', 'rendu projeté avec texte et titre d''étape');
select test.verifier((public.etat_session(current_setting('test.s5')::uuid)->'rendu_projete') ? 'pseudo' = false
                     and public.etat_session(current_setting('test.s5')::uuid)::text not like '%Alice%', 'le rendu projeté ne contient aucun pseudo');
reset role;
-- Bob (téléphone) voit le rendu projeté, jamais le pseudo d'Alice
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
set role authenticated;
select test.verifier(public.etat_session(current_setting('test.s5')::uuid)->'rendu_projete'->>'texte' = 'Mon prompt perso (corrigé)'
                     and public.etat_session(current_setting('test.s5')::uuid)::text not like '%Alice%', 'un téléphone voit le rendu projeté sans pseudo');
reset role;

-- La jauge n'est pas affectée par l'atelier
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select test.verifier(public.etat_session(current_setting('test.s5')::uuid)->>'jauge' = current_setting('test.jauge_avant'), 'la jauge est inchangée par l''atelier');
select test.verifier((public.etat_session(current_setting('test.s5')::uuid)->'jauge'->>'maximum')::int = 4, 'maximum de la jauge : 2 participants × QCM (atelier = 0)');

-- Terminer l'atelier : le rendu projeté disparaît
select public.fermer_question(current_setting('test.s5')::uuid);
select test.verifier((select rendu_projete_id is null from public.sessions where id = current_setting('test.s5')::uuid), 'fermer : rendu_projete_id remis à null');
select test.verifier(jsonb_typeof(public.etat_session(current_setting('test.s5')::uuid)->'rendu_projete') = 'null', 'fermer : rendu_projete null dans etat_session');
select test.verifier(public.etat_session(current_setting('test.s5')::uuid)->>'etat' = 'resultats', 'fermer : état résultats');
select test.doit_echouer($$select public.projeter_rendu(current_setting('test.s5')::uuid, current_setting('test.rendu_alice')::uuid)$$, 'n''appartient pas');
select test.verifier(public.etat_session(current_setting('test.s5')::uuid)->>'jauge' = current_setting('test.jauge_avant'), 'la jauge reste inchangée après l''atelier');
reset role;

-- Hors atelier ouvert : les participants sont refusés
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
set role authenticated;
select test.doit_echouer(format('select public.atelier_aller_a(%L, 1)', current_setting('test.qat')), 'pas ouvert');
select test.doit_echouer(format('select public.atelier_bloque(%L, true)', current_setting('test.qat')), 'pas ouvert');
select test.doit_echouer($$select public.atelier_rendre(current_setting('test.e2')::uuid, 'trop tard')$$, 'pas ouvert');
reset role;

-- Bilan : l'atelier ne casse ni les mentions ni le bilan
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select public.passer_au_bilan(current_setting('test.s5')::uuid);
select test.verifier(public.etat_session(current_setting('test.s5')::uuid)->>'etat' = 'bilan', 'le bilan fonctionne après un atelier');
select test.verifier(exists (select 1 from public.mentions where session_id = current_setting('test.s5')::uuid and type = 'a_repondu_a_tout'), 'Alice a bien « répondu à tout » (l''atelier n''est pas compté)');
reset role;
