-- Rapport par email + newsletter + réglages d'administration (spec SPEC-RAPPORT-EMAIL.md).
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
grant usage on schema test to anon;

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-00000000a701', null, true),
  ('00000000-0000-0000-0000-00000000a702', null, true),
  ('00000000-0000-0000-0000-0000000000f3', 'nouveau@exemple.be', false)
on conflict do nothing;
insert into public.formateurs (id, email) values ('00000000-0000-0000-0000-0000000000f3', 'nouveau@exemple.be')
on conflict (id) do update set actif = true, est_admin = false;
update public.formateurs set actif = true, est_admin = true where id = '00000000-0000-0000-0000-00000000000f';

-- ===== Valeurs par défaut : tout est désactivé =====
select test.verifier((select rapport_actif = false and newsletter_active = false and liens_suivi = '[]'::jsonb
                      from public.parametres_generaux where id = 1), 'réglages généraux : tout désactivé par défaut');
select test.verifier((select count(*) from public.parametres_generaux) = 1, 'une seule ligne de réglages généraux');
select test.verifier((select rapport_autorise from public.formateurs where id = '00000000-0000-0000-0000-00000000000f'), 'formateur autorisé par défaut');

-- ===== Préparation : un quiz avec QCM, ouverte, atelier, et un QCM jamais posé =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
insert into public.quiz (id, formateur_id, titre) values ('70000000-0000-0000-0000-000000000001', auth.uid(), 'Quiz rapport');
insert into public.questions (id, quiz_id, ordre, type, enonce, choix, bonne_reponse, explication) values
  ('70000000-0000-0000-0000-0000000000a1', '70000000-0000-0000-0000-000000000001', 1, 'qcm', 'Question QCM posée', '{Oui,Non}', 0, 'Parce que oui.');
insert into public.questions (id, quiz_id, ordre, type, enonce) values
  ('70000000-0000-0000-0000-0000000000a2', '70000000-0000-0000-0000-000000000001', 2, 'ouverte', 'Question ouverte posée');
insert into public.questions (id, quiz_id, ordre, type, enonce) values
  ('70000000-0000-0000-0000-0000000000a3', '70000000-0000-0000-0000-000000000001', 3, 'atelier', 'Atelier posé');
insert into public.etapes_atelier (question_id, ordre, titre, rendu_attendu) values
  ('70000000-0000-0000-0000-0000000000a3', 1, 'Écrire un prompt', true),
  ('70000000-0000-0000-0000-0000000000a3', 2, 'Conclure', false);
insert into public.questions (id, quiz_id, ordre, type, enonce, choix, bonne_reponse, explication) values
  ('70000000-0000-0000-0000-0000000000a4', '70000000-0000-0000-0000-000000000001', 4, 'qcm', 'QCM JAMAIS POSE', '{Rouge,Bleu}', 1, 'EXPLICATION SECRETE');
select set_config('test.s', public.lancer_session('70000000-0000-0000-0000-000000000001')->>'session_id', false);
select set_config('test.code', (select code from public.sessions where id = current_setting('test.s')::uuid), false);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a701', false);
set role authenticated;
select public.rejoindre_session(current_setting('test.code'), 'Alice');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a702', false);
set role authenticated;
select public.rejoindre_session(current_setting('test.code'), 'Bob');
reset role;

-- Question 1 : Alice juste, Bob se trompe
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select public.ouvrir_question(current_setting('test.s')::uuid);
select set_config('test.q1', (select question_courante_id::text from public.sessions where id = current_setting('test.s')::uuid), false);
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a701', false);
set role authenticated; select public.repondre(current_setting('test.q1')::uuid, '0'); reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a702', false);
set role authenticated; select public.repondre(current_setting('test.q1')::uuid, '1'); reset role;
-- Question 2 : ouverte
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select public.ouvrir_question(current_setting('test.s')::uuid);
select set_config('test.q2', (select question_courante_id::text from public.sessions where id = current_setting('test.s')::uuid), false);
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a701', false);
set role authenticated; select public.repondre(current_setting('test.q2')::uuid, '"Réponse ouverte d''Alice"'); reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a702', false);
set role authenticated; select public.repondre(current_setting('test.q2')::uuid, '"SECRET-DE-BOB"'); reset role;
-- Question 3 : atelier
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select public.ouvrir_question(current_setting('test.s')::uuid);
reset role;
select set_config('test.e1', (select e.id::text from public.etapes_session e where e.session_id = current_setting('test.s')::uuid and e.ordre = 1), false);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a701', false);
set role authenticated; select public.atelier_rendre(current_setting('test.e1')::uuid, 'Rendu atelier d''Alice'); reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a702', false);
set role authenticated; select public.atelier_rendre(current_setting('test.e1')::uuid, 'RENDU-SECRET-DE-BOB'); reset role;

-- Avant le bilan : rien n'est proposé
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a701', false);
set role authenticated;
select test.verifier(not (public.etat_session(current_setting('test.s')::uuid) ? 'rapport'), 'pas de bloc rapport avant le bilan');
select test.doit_echouer($$select public.demander_rapport(current_setting('test.s')::uuid, 'alice@exemple.be')$$, 'à la fin du quiz');
reset role;

-- Bilan
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select public.passer_au_bilan(current_setting('test.s')::uuid);
select test.verifier(not (public.etat_session(current_setting('test.s')::uuid) ? 'rapport'), 'le formateur ne reçoit pas le bloc rapport');
reset role;

-- ===== Réglages désactivés : rien n'est proposé, la demande est refusée =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a701', false);
set role authenticated;
select test.verifier((public.etat_session(current_setting('test.s')::uuid)->'rapport'->>'propose')::boolean = false, 'réglages désactivés : rapport non proposé');
select test.verifier((public.etat_session(current_setting('test.s')::uuid)->'rapport'->>'newsletter_proposee')::boolean = false, 'newsletter non proposée');
select test.verifier((public.etat_session(current_setting('test.s')::uuid)->'rapport'->>'deja_demande')::boolean = false, 'pas encore demandé');
select test.doit_echouer($$select public.demander_rapport(current_setting('test.s')::uuid, 'alice@exemple.be')$$, 'n''est pas disponible pour ce quiz');
reset role;

-- ===== Droits : non-admin refusé, formateur ne lit pas les réglages directement =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f3', false);
set role authenticated;
select test.doit_echouer($$select public.admin_lire_parametres()$$, 'Réservé à l''administration');
select test.doit_echouer($$select public.admin_modifier_parametres(true, true, '[]', null)$$, 'Réservé à l''administration');
select test.doit_echouer($$select public.admin_lire_reglages_quiz('70000000-0000-0000-0000-000000000001')$$, 'Réservé à l''administration');
select test.doit_echouer($$select public.admin_modifier_reglages_quiz('70000000-0000-0000-0000-000000000001', 'actif', 'actif', null)$$, 'Réservé à l''administration');
select test.doit_echouer($$select public.admin_autoriser_rapport_formateur('00000000-0000-0000-0000-0000000000f3', false)$$, 'Réservé à l''administration');
select test.doit_echouer($$select public.admin_nommer_formateur('00000000-0000-0000-0000-0000000000f3', 'Pirate')$$, 'Réservé à l''administration');
select test.verifier((select count(*) from public.parametres_generaux) = 0, 'un formateur ne lit pas parametres_generaux');
update public.parametres_generaux set rapport_actif = true;
select test.verifier((select count(*) from public.reglages_quiz) = 0, 'un formateur ne lit pas reglages_quiz');
select test.doit_echouer($$insert into public.reglages_quiz (quiz_id, rapport) values ('70000000-0000-0000-0000-000000000001', 'actif')$$, 'row-level security');
select test.doit_echouer($$select * from public.demandes_rapport$$, 'permission denied');
reset role;
select test.verifier((select rapport_actif = false from public.parametres_generaux where id = 1), 'la tentative de modification par un formateur n''a rien changé');
set role anon;
select test.doit_echouer($$select * from public.parametres_generaux$$, 'permission denied');
select test.doit_echouer($$select public.admin_lire_parametres()$$, 'permission denied');
select test.doit_echouer($$select public.demander_rapport('70000000-0000-0000-0000-000000000009', 'a@b.be')$$, 'permission denied');
reset role;

-- ===== Admin : validation des liens et activation =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select test.verifier((select count(*) from public.admin_liste_formateurs() where rapport_autorise) = (select count(*) from public.formateurs), 'admin_liste_formateurs expose rapport_autorise');
select test.doit_echouer($$select public.admin_modifier_parametres(true, true, '[{"titre":"T","texte":"x","url":"http://pas-https.be","bouton":"B"}]', null)$$, 'https://');
select test.doit_echouer($$select public.admin_modifier_parametres(true, true, '[{"titre":"","texte":"x","url":"https://ok.be","bouton":"B"}]', null)$$, 'titre');
select test.doit_echouer(format($f$select public.admin_modifier_parametres(true, true, %L, null)$f$, '[' || repeat('{"titre":"T","texte":"x","url":"https://ok.be","bouton":"B"},', 5) || '{"titre":"T","texte":"x","url":"https://ok.be","bouton":"B"}]'), '5 liens');
select test.doit_echouer(format($f$select public.admin_modifier_parametres(true, true, %L::jsonb, null)$f$, jsonb_build_array(jsonb_build_object('titre', repeat('x', 81), 'texte', 'x', 'url', 'https://ok.be', 'bouton', 'B'))), 'titre');
select test.doit_echouer(format($f$select public.admin_modifier_parametres(true, true, %L::jsonb, null)$f$, jsonb_build_array(jsonb_build_object('titre', 'T', 'texte', repeat('x', 201), 'url', 'https://ok.be', 'bouton', 'B'))), 'accroche');
select test.doit_echouer(format($f$select public.admin_modifier_parametres(true, true, %L::jsonb, null)$f$, jsonb_build_array(jsonb_build_object('titre', 'T', 'texte', 'x', 'url', 'https://ok.be', 'bouton', repeat('x', 41)))), 'bouton');
select test.doit_echouer($$select public.admin_modifier_parametres(true, true, '{"a":1}', null)$$, 'liste des liens');
select test.doit_echouer($$select public.admin_modifier_parametres(true, true, '[]', 'http://confidentialite.be')$$, 'https://');
select test.verifier((select rapport_actif = false from public.parametres_generaux where id = 1), 'les refus de validation n''ont rien enregistré');
select public.admin_modifier_parametres(true, false,
  '[{"titre":" Rejoins REVOLia Campus ","texte":"Une phrase","url":"https://campus.revolia.be","bouton":"Découvrir","intrus":"x"},{"titre":"Deuxième","texte":"","url":"https://revolia.be/x","bouton":"Voir"}]',
  'https://revolia.be/confidentialite');
select test.verifier((public.admin_lire_parametres()->>'rapport_actif')::boolean and not (public.admin_lire_parametres()->>'newsletter_active')::boolean, 'admin active le rapport seul');
select test.verifier(jsonb_array_length(public.admin_lire_parametres()->'liens_suivi') = 2
                     and public.admin_lire_parametres()->'liens_suivi'->0->>'titre' = 'Rejoins REVOLia Campus'
                     and not (public.admin_lire_parametres()->'liens_suivi'->0 ? 'intrus'), 'liens nettoyés (espaces, clés inconnues)');
select test.verifier(public.admin_lire_parametres()->>'url_confidentialite' = 'https://revolia.be/confidentialite', 'url de confidentialité enregistrée');
reset role;

-- ===== Règles effectives : l'admin a le dernier mot à chaque niveau =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a701', false);
set role authenticated;
select test.verifier((public.etat_session(current_setting('test.s')::uuid)->'rapport'->>'propose')::boolean, 'général activé + formateur autorisé : rapport proposé');
select test.verifier(public.etat_session(current_setting('test.s')::uuid)->'rapport'->>'url_confidentialite' = 'https://revolia.be/confidentialite', 'url de confidentialité exposée au participant');
select test.verifier(not (public.etat_session(current_setting('test.s')::uuid)->'rapport'->>'newsletter_proposee')::boolean, 'newsletter encore éteinte');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select public.admin_modifier_reglages_quiz('70000000-0000-0000-0000-000000000001', 'inactif', 'herite', null);
select test.verifier(public.admin_lire_reglages_quiz('70000000-0000-0000-0000-000000000001')->>'rapport' = 'inactif', 'réglage de quiz lu');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a701', false);
set role authenticated;
select test.verifier(not (public.etat_session(current_setting('test.s')::uuid)->'rapport'->>'propose')::boolean, 'quiz « inactif » : rapport non proposé');
select test.doit_echouer($$select public.demander_rapport(current_setting('test.s')::uuid, 'alice@exemple.be')$$, 'n''est pas disponible pour ce quiz');
reset role;

-- « actif » sur un quiz ne contourne pas l'interrupteur général éteint
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select public.admin_modifier_reglages_quiz('70000000-0000-0000-0000-000000000001', 'actif', 'actif', null);
select public.admin_modifier_parametres(false, false, '[]', null);
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a701', false);
set role authenticated;
select test.verifier(not (public.etat_session(current_setting('test.s')::uuid)->'rapport'->>'propose')::boolean, 'quiz « actif » ne contourne pas l''interrupteur général');
reset role;

-- Formateur non autorisé : non proposé
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select public.admin_modifier_parametres(true, true,
  '[{"titre":"Rejoins REVOLia Campus","texte":"Une phrase","url":"https://campus.revolia.be","bouton":"Découvrir"},{"titre":"Deuxième","texte":"","url":"https://revolia.be/x","bouton":"Voir"}]',
  'https://revolia.be/confidentialite');
select public.admin_autoriser_rapport_formateur('00000000-0000-0000-0000-00000000000f', false);
select test.verifier((select not rapport_autorise from public.admin_liste_formateurs() where id = auth.uid()), 'rapport_autorise visible dans la liste');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a701', false);
set role authenticated;
select test.verifier(not (public.etat_session(current_setting('test.s')::uuid)->'rapport'->>'propose')::boolean, 'formateur non autorisé : rapport non proposé');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select public.admin_autoriser_rapport_formateur('00000000-0000-0000-0000-00000000000f', true);
select test.doit_echouer($$select public.admin_autoriser_rapport_formateur('00000000-0000-0000-0000-0000000000aa', true)$$, 'introuvable');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a701', false);
set role authenticated;
select test.verifier((public.etat_session(current_setting('test.s')::uuid)->'rapport'->>'propose')::boolean
                     and (public.etat_session(current_setting('test.s')::uuid)->'rapport'->>'newsletter_proposee')::boolean, 'tout allumé : rapport et newsletter proposés');
reset role;

-- Quiz « inactif » : le rapport s'éteint ; newsletter « inactive » seule : rapport reste
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select public.admin_modifier_reglages_quiz('70000000-0000-0000-0000-000000000001', 'herite', 'inactif', null);
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a701', false);
set role authenticated;
select test.verifier((public.etat_session(current_setting('test.s')::uuid)->'rapport'->>'propose')::boolean
                     and not (public.etat_session(current_setting('test.s')::uuid)->'rapport'->>'newsletter_proposee')::boolean, 'newsletter « inactive » sur le quiz : rapport seul');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select public.admin_modifier_reglages_quiz('70000000-0000-0000-0000-000000000001', 'herite', 'herite', null);
select test.doit_echouer($$select public.admin_modifier_reglages_quiz('70000000-0000-0000-0000-000000000001', 'oui', 'herite', null)$$, 'hérité');
select test.doit_echouer($$select public.admin_modifier_reglages_quiz('70000000-0000-0000-0000-000000000099', 'herite', 'herite', null)$$, 'introuvable');
reset role;

-- ===== demander_rapport =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a701', false);
set role authenticated;
select test.doit_echouer($$select public.demander_rapport(current_setting('test.s')::uuid, 'pas-un-email')$$, 'ne semble pas valide');
select test.doit_echouer($$select public.demander_rapport(current_setting('test.s')::uuid, 'a b@exemple.be')$$, 'ne semble pas valide');
select test.doit_echouer($$select public.demander_rapport(current_setting('test.s')::uuid, 'a@exemple')$$, 'ne semble pas valide');
select test.doit_echouer($$select public.demander_rapport(current_setting('test.s')::uuid, null)$$, 'ne semble pas valide');
select test.doit_echouer(format($f$select public.demander_rapport(%L::uuid, %L)$f$, current_setting('test.s'), repeat('a', 250) || '@exemple.be'), 'ne semble pas valide');
select set_config('test.demande_a', public.demander_rapport(current_setting('test.s')::uuid, '  Alice@Exemple.BE ')->>'demande_id', false);
select test.verifier((public.etat_session(current_setting('test.s')::uuid)->'rapport'->>'deja_demande')::boolean
                     and public.etat_session(current_setting('test.s')::uuid)->'rapport'->>'email_masque' = 'a***@exemple.be', 'deja_demande et email masqué');
reset role;
select test.verifier((select email = 'alice@exemple.be' and nb_envois = 1 from public.demandes_rapport where id = current_setting('test.demande_a')::uuid), 'email normalisé (minuscules, espaces retirés), nb_envois = 1');
select set_config('test.jeton_a', (select jeton_rapport::text from public.demandes_rapport where id = current_setting('test.demande_a')::uuid), false);
select set_config('test.jeton_nl_a', (select jeton_newsletter::text from public.demandes_rapport where id = current_setting('test.demande_a')::uuid), false);

-- un non-participant est refusé
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f3', false);
set role authenticated;
select test.doit_echouer($$select public.demander_rapport(current_setting('test.s')::uuid, 'x@exemple.be')$$, 'ne participes pas');
reset role;

-- nb_envois ≤ 3, jetons stables, nouvel email remplace l'ancien
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a701', false);
set role authenticated;
select public.demander_rapport(current_setting('test.s')::uuid, 'alice.nouvelle@exemple.be');
select public.demander_rapport(current_setting('test.s')::uuid, 'alice.nouvelle@exemple.be');
select test.doit_echouer($$select public.demander_rapport(current_setting('test.s')::uuid, 'alice.nouvelle@exemple.be')$$, 'plusieurs fois');
reset role;
select test.verifier((select count(*) = 1 and max(nb_envois) = 3 and max(email) = 'alice.nouvelle@exemple.be'
                             and max(jeton_rapport::text) = current_setting('test.jeton_a')
                             and max(jeton_newsletter::text) = current_setting('test.jeton_nl_a')
                      from public.demandes_rapport where participant_id = (select id from public.participants where pseudo = 'Alice' and session_id = current_setting('test.s')::uuid)),
                     'une seule ligne par participant, nb_envois plafonné à 3, jetons non régénérés, email remplacé');

-- Bob demande aussi
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a702', false);
set role authenticated;
select set_config('test.demande_b', public.demander_rapport(current_setting('test.s')::uuid, 'bob@exemple.be')->>'demande_id', false);
reset role;
select set_config('test.jeton_b', (select jeton_rapport::text from public.demandes_rapport where id = current_setting('test.demande_b')::uuid), false);

-- ===== rapport_par_jeton (anon) : le rapport d'Alice, rien d'autre =====
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select set_config('test.rapport_a', public.rapport_par_jeton(current_setting('test.jeton_a')::uuid)::text, false);
reset role;
select test.verifier((current_setting('test.rapport_a')::jsonb)->>'pseudo' = 'Alice', 'rapport : pseudo de la personne elle-même');
select test.verifier((current_setting('test.rapport_a')::jsonb)->>'quiz_titre' = 'Quiz rapport', 'rapport : titre du quiz');
select test.verifier(jsonb_array_length((current_setting('test.rapport_a')::jsonb)->'questions') = 3, 'rapport : seulement les 3 questions posées');
select test.verifier((current_setting('test.rapport_a')::jsonb)::text not like '%JAMAIS POSE%'
                     and (current_setting('test.rapport_a')::jsonb)::text not like '%EXPLICATION SECRETE%', 'rapport : aucune trace de la question non posée');
select test.verifier((current_setting('test.rapport_a')::jsonb)::text not like '%Bob%'
                     and (current_setting('test.rapport_a')::jsonb)::text not like '%SECRET-DE-BOB%'
                     and (current_setting('test.rapport_a')::jsonb)::text not like '%RENDU-SECRET-DE-BOB%', 'rapport : rien d''un autre participant');
select test.verifier((current_setting('test.rapport_a')::jsonb)->'questions'->0->'mes_reponses' = '[0]'::jsonb
                     and (current_setting('test.rapport_a')::jsonb)->'questions'->0->'bonnes_reponses' = '[0]'::jsonb
                     and (current_setting('test.rapport_a')::jsonb)->'questions'->0->>'explication' = 'Parce que oui.', 'rapport : QCM, sa réponse, la bonne réponse et l''explication');
select test.verifier((current_setting('test.rapport_a')::jsonb)->'questions'->1->'mes_reponses' = '["Réponse ouverte d''Alice"]'::jsonb
                     and (current_setting('test.rapport_a')::jsonb)->'questions'->1->'bonnes_reponses' = 'null'::jsonb, 'rapport : question ouverte sans bonne réponse');
select test.verifier((current_setting('test.rapport_a')::jsonb)->'questions'->2->'etapes'->0->>'titre' = 'Écrire un prompt'
                     and (current_setting('test.rapport_a')::jsonb)->'questions'->2->'etapes'->0->>'mon_rendu' = 'Rendu atelier d''Alice'
                     and (current_setting('test.rapport_a')::jsonb)->'questions'->2->'etapes'->1->'mon_rendu' = 'null'::jsonb, 'rapport : atelier, titres et son rendu');
select test.verifier(jsonb_array_length((current_setting('test.rapport_a')::jsonb)->'liens_suivi') = 2
                     and ((current_setting('test.rapport_a')::jsonb)->>'newsletter_proposee')::boolean
                     and (current_setting('test.rapport_a')::jsonb)->>'jeton_newsletter' = current_setting('test.jeton_nl_a')
                     and not ((current_setting('test.rapport_a')::jsonb)->>'newsletter_confirmee')::boolean
                     and (current_setting('test.rapport_a')::jsonb)->>'url_confidentialite' = 'https://revolia.be/confidentialite', 'rapport : liens, newsletter, confidentialité');

-- Bob : son propre rapport (et pas celui d'Alice)
set role anon;
select set_config('test.rapport_b', public.rapport_par_jeton(current_setting('test.jeton_b')::uuid)::text, false);
reset role;
select test.verifier((current_setting('test.rapport_b')::jsonb)->>'pseudo' = 'Bob'
                     and (current_setting('test.rapport_b')::jsonb)->'questions'->0->'mes_reponses' = '[1]'::jsonb
                     and (current_setting('test.rapport_b')::jsonb)::text like '%SECRET-DE-BOB%'
                     and (current_setting('test.rapport_b')::jsonb)::text not like '%Alice%', 'rapport de Bob : ses réponses seulement');

-- Jeton inconnu / jeton de newsletter utilisé comme jeton de rapport
set role anon;
select test.doit_echouer($$select public.rapport_par_jeton('11111111-1111-1111-1111-111111111111')$$, 'Ce rapport n''existe plus');
select test.doit_echouer($$select public.rapport_par_jeton(current_setting('test.jeton_nl_a')::uuid)$$, 'Ce rapport n''existe plus');
reset role;
-- authenticated peut aussi l'appeler
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a701', false);
set role authenticated;
select test.verifier(public.rapport_par_jeton(current_setting('test.jeton_a')::uuid)->>'pseudo' = 'Alice', 'authenticated peut lire un rapport par jeton');
reset role;

-- ===== Nom du formateur : l'admin le renseigne, il apparaît dans le rapport =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select public.admin_nommer_formateur('00000000-0000-0000-0000-00000000000f', '  Jean-François  ');
select test.verifier((select nom from public.admin_liste_formateurs() where id = '00000000-0000-0000-0000-00000000000f') = 'Jean-François', 'admin nomme un formateur (nom trimé, renvoyé par la liste)');
select test.doit_echouer($$select public.admin_nommer_formateur('00000000-0000-0000-0000-00000000000f', repeat('x', 81))$$, 'ne doit pas dépasser 80');
reset role;
set role anon;
select test.verifier(public.rapport_par_jeton(current_setting('test.jeton_a')::uuid)->>'formateur_nom' = 'Jean-François', 'rapport_par_jeton renvoie formateur_nom');
reset role;

-- ===== Liens : propres au quiz (remplacent), vides (aucun), hérités =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select public.admin_modifier_reglages_quiz('70000000-0000-0000-0000-000000000001', 'herite', 'herite',
  '[{"titre":"Lien du quiz","texte":"Spécial","url":"https://exemple.be/quiz","bouton":"Go"}]');
select test.verifier(jsonb_array_length(public.admin_lire_reglages_quiz('70000000-0000-0000-0000-000000000001')->'liens_suivi') = 1
                     and jsonb_array_length(public.admin_lire_reglages_quiz('70000000-0000-0000-0000-000000000001')->'liens_generaux') = 2, 'admin lit liens propres et généraux');
reset role;
set role anon;
select test.verifier(jsonb_array_length(public.rapport_par_jeton(current_setting('test.jeton_a')::uuid)->'liens_suivi') = 1
                     and public.rapport_par_jeton(current_setting('test.jeton_a')::uuid)->'liens_suivi'->0->>'titre' = 'Lien du quiz', 'liens propres : remplacent les généraux');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select public.admin_modifier_reglages_quiz('70000000-0000-0000-0000-000000000001', 'herite', 'herite', '[]');
reset role;
set role anon;
select test.verifier(jsonb_array_length(public.rapport_par_jeton(current_setting('test.jeton_a')::uuid)->'liens_suivi') = 0, 'liens propres vides : aucun lien');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select public.admin_modifier_reglages_quiz('70000000-0000-0000-0000-000000000001', 'herite', 'herite', null);
select test.verifier(public.admin_lire_reglages_quiz('70000000-0000-0000-0000-000000000001')->'liens_suivi' = 'null'::jsonb, 'null = hérite');
reset role;
set role anon;
select test.verifier(jsonb_array_length(public.rapport_par_jeton(current_setting('test.jeton_a')::uuid)->'liens_suivi') = 2, 'liens hérités des réglages généraux');
reset role;

-- ===== Fonctions internes : refusées aux clients =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a701', false);
set role authenticated;
select test.doit_echouer($$select public.rapport_pour_envoi(current_setting('test.demande_a')::uuid, auth.uid())$$, 'permission denied');
select test.doit_echouer($$select public.rapport_marquer_envoye(current_setting('test.demande_a')::uuid)$$, 'permission denied');
select test.doit_echouer($$select public.newsletter_confirmer(current_setting('test.jeton_nl_a')::uuid)$$, 'permission denied');
select test.doit_echouer($$select public.rapport_regles(current_setting('test.s')::uuid)$$, 'permission denied');
reset role;
set role anon;
select test.doit_echouer($$select public.rapport_pour_envoi(current_setting('test.demande_a')::uuid, '00000000-0000-0000-0000-00000000a701')$$, 'permission denied');
select test.doit_echouer($$select public.newsletter_confirmer(current_setting('test.jeton_nl_a')::uuid)$$, 'permission denied');
reset role;

-- rapport_pour_envoi (appel serveur) : seulement pour le bon utilisateur
select test.doit_echouer($$select public.rapport_pour_envoi(current_setting('test.demande_a')::uuid, '00000000-0000-0000-0000-00000000a702')$$, 'introuvable');
select test.doit_echouer($$select public.rapport_pour_envoi(current_setting('test.demande_a')::uuid, '00000000-0000-0000-0000-0000000000ff')$$, 'introuvable');
select set_config('test.envoi_a',
  public.rapport_pour_envoi(current_setting('test.demande_a')::uuid, '00000000-0000-0000-0000-00000000a701')::text, false);
select test.verifier((current_setting('test.envoi_a')::jsonb)->>'email' = 'alice.nouvelle@exemple.be'
                     and (current_setting('test.envoi_a')::jsonb)->>'jeton_rapport' = current_setting('test.jeton_a')
                     and (current_setting('test.envoi_a')::jsonb)->>'quiz_titre' = 'Quiz rapport'
                     and (current_setting('test.envoi_a')::jsonb)->>'pseudo' = 'Alice'
                     and ((current_setting('test.envoi_a')::jsonb)->>'nb_questions')::int = 3
                     and ((current_setting('test.envoi_a')::jsonb)->>'nb_bonnes')::int = 1
                     and jsonb_array_length((current_setting('test.envoi_a')::jsonb)->'liens_suivi') = 2
                     and ((current_setting('test.envoi_a')::jsonb)->>'newsletter_proposee')::boolean
                     and (current_setting('test.envoi_a')::jsonb)->>'jeton_newsletter' = current_setting('test.jeton_nl_a'), 'rapport_pour_envoi : contenu attendu');
select public.rapport_marquer_envoye(current_setting('test.demande_a')::uuid);
select test.verifier((select envoye_le is not null and not a_envoyer from public.demandes_rapport where id = current_setting('test.demande_a')::uuid), 'rapport_marquer_envoye : envoye_le renseigné, a_envoyer remis à faux');
select test.doit_echouer($$select public.rapport_pour_envoi(current_setting('test.demande_a')::uuid, '00000000-0000-0000-0000-00000000a701')$$, 'déjà été envoyé');
select test.verifier((select a_envoyer from public.demandes_rapport where id = current_setting('test.demande_b')::uuid), 'une demande acceptée autorise un envoi (a_envoyer)');

-- Anti-spam : une nouvelle demande accepte un nouvel envoi (Bob), un seul à la fois
select public.rapport_pour_envoi(current_setting('test.demande_b')::uuid, '00000000-0000-0000-0000-00000000a702');
select public.rapport_marquer_envoye(current_setting('test.demande_b')::uuid);
select test.doit_echouer($$select public.rapport_pour_envoi(current_setting('test.demande_b')::uuid, '00000000-0000-0000-0000-00000000a702')$$, 'déjà été envoyé');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a702', false);
set role authenticated;
select public.demander_rapport(current_setting('test.s')::uuid, 'bob@exemple.be');
reset role;
select test.verifier((select a_envoyer from public.demandes_rapport where id = current_setting('test.demande_b')::uuid), 'nouvelle demande : envoi de nouveau autorisé');
select public.rapport_pour_envoi(current_setting('test.demande_b')::uuid, '00000000-0000-0000-0000-00000000a702');
select public.rapport_marquer_envoye(current_setting('test.demande_b')::uuid);

-- Anti-spam : 5 demandes par adresse en 24 h (toutes sessions confondues)
insert into auth.users (id, email, is_anonymous)
  select ('00000000-0000-0000-0000-0000000b0' || lpad(i::text, 3, '0'))::uuid, null, true from generate_series(1, 5) i;
insert into public.participants (id, session_id, utilisateur_id, pseudo)
  select ('00000000-0000-0000-0000-0000000c0' || lpad(i::text, 3, '0'))::uuid, current_setting('test.s')::uuid,
         ('00000000-0000-0000-0000-0000000b0' || lpad(i::text, 3, '0'))::uuid, 'spam' || i from generate_series(1, 5) i;
insert into public.demandes_rapport (session_id, participant_id, email, nb_envois)
  select current_setting('test.s')::uuid, ('00000000-0000-0000-0000-0000000c0' || lpad(i::text, 3, '0'))::uuid, 'spam@exemple.be', 1
  from generate_series(1, 5) i;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a702', false);
set role authenticated;
select test.doit_echouer($$select public.demander_rapport(current_setting('test.s')::uuid, 'Spam@Exemple.be')$$, 'Trop de demandes pour cette adresse aujourd''hui');
reset role;
update public.demandes_rapport set derniere_demande_le = now() - interval '25 hours' where email = 'spam@exemple.be' and participant_id = '00000000-0000-0000-0000-0000000c0001';
set role authenticated;
select public.demander_rapport(current_setting('test.s')::uuid, 'spam@exemple.be');
reset role;
select test.verifier((select count(*) from public.demandes_rapport where email = 'spam@exemple.be') = 6, 'adresse : une demande de plus de 24 h ne compte plus');
delete from public.demandes_rapport where email = 'spam@exemple.be' and participant_id <> (select id from public.participants where pseudo = 'Bob' and session_id = current_setting('test.s')::uuid);
update public.demandes_rapport set email = 'bob@exemple.be', nb_envois = 1 where participant_id = (select id from public.participants where pseudo = 'Bob' and session_id = current_setting('test.s')::uuid);

-- Anti-spam : 300 demandes par quiz
insert into auth.users (id, email, is_anonymous)
  select ('00000000-0000-0000-0000-000000d' || lpad(i::text, 5, '0'))::uuid, null, true from generate_series(1, 300) i;
insert into public.participants (id, session_id, utilisateur_id, pseudo)
  select ('00000000-0000-0000-0000-000000e' || lpad(i::text, 5, '0'))::uuid, current_setting('test.s')::uuid,
         ('00000000-0000-0000-0000-000000d' || lpad(i::text, 5, '0'))::uuid, 'f' || i from generate_series(1, 300) i;
insert into public.demandes_rapport (session_id, participant_id, email, nb_envois)
  select current_setting('test.s')::uuid, ('00000000-0000-0000-0000-000000e' || lpad(i::text, 5, '0'))::uuid, 'f' || i || '@fake.be', 1
  from generate_series(1, 300) i;
set role authenticated;
select test.doit_echouer($$select public.demander_rapport(current_setting('test.s')::uuid, 'bob@exemple.be')$$, 'Trop de demandes pour ce quiz');
reset role;
delete from public.demandes_rapport where email like '%@fake.be';
delete from public.participants where pseudo ~ '^(f[0-9]+|spam[0-9])$';

-- ===== Newsletter : usage unique =====
select test.doit_echouer($$select public.newsletter_confirmer('11111111-1111-1111-1111-111111111111')$$, 'n''est plus valide');
select test.doit_echouer($$select public.newsletter_confirmer(current_setting('test.jeton_a')::uuid)$$, 'n''est plus valide');
select test.verifier((public.newsletter_confirmer(current_setting('test.jeton_nl_a')::uuid)->>'deja_confirmee')::boolean = false
                     and public.newsletter_confirmer(current_setting('test.jeton_nl_a')::uuid)->>'email' = 'alice.nouvelle@exemple.be', '1re confirmation newsletter : deja_confirmee = false');
select test.verifier((public.newsletter_confirmer(current_setting('test.jeton_nl_a')::uuid)->>'deja_confirmee')::boolean, '2e confirmation : deja_confirmee = true (usage unique)');
select test.verifier((select newsletter_confirmee_le is not null from public.demandes_rapport where id = current_setting('test.demande_a')::uuid), 'newsletter_confirmee_le renseigné');
set role anon;
select test.verifier(public.rapport_par_jeton(current_setting('test.jeton_a')::uuid)->'jeton_newsletter' = 'null'::jsonb
                     and (public.rapport_par_jeton(current_setting('test.jeton_a')::uuid)->>'newsletter_confirmee')::boolean, 'rapport : newsletter confirmée, plus de jeton');
reset role;

-- Newsletter éteinte : le lien n'est plus valide, le jeton disparaît du rapport de Bob
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select public.admin_modifier_parametres(true, false, public.admin_lire_parametres()->'liens_suivi', 'https://revolia.be/confidentialite');
reset role;
select test.doit_echouer(format($f$select public.newsletter_confirmer(%L::uuid)$f$, (select jeton_newsletter from public.demandes_rapport where id = current_setting('test.demande_b')::uuid)), 'n''est plus valide');
set role anon;
select test.verifier(public.rapport_par_jeton(current_setting('test.jeton_b')::uuid)->'jeton_newsletter' = 'null'::jsonb
                     and not (public.rapport_par_jeton(current_setting('test.jeton_b')::uuid)->>'newsletter_proposee')::boolean, 'newsletter éteinte : aucun jeton exposé');
reset role;

-- ===== Purge : les demandes disparaissent avec la session =====
select test.verifier((select count(*) from public.demandes_rapport where session_id = current_setting('test.s')::uuid) = 2, 'deux demandes avant la purge');
delete from public.sessions where id = current_setting('test.s')::uuid;
select test.verifier((select count(*) from public.demandes_rapport where session_id = current_setting('test.s')::uuid) = 0, 'demandes supprimées avec la session (cascade)');
