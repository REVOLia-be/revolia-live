-- Code permanent par quiz + plusieurs réponses aux questions ouvertes (spec A et B).
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on

-- Vérifie qu'une instruction échoue avec un code d'erreur SQL précis.
create function test.doit_echouer_code(sql text, attendu_etat text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'ÉCHEC : aurait dû échouer → %', sql;
exception when others then
  if sqlerrm like 'ÉCHEC%' or sqlstate <> attendu_etat then
    raise exception 'ÉCHEC : % → code inattendu % : %', sql, sqlstate, sqlerrm;
  end if;
end $$;
grant execute on function test.doit_echouer_code(text, text) to authenticated;

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-00000000a601', null, true),
  ('00000000-0000-0000-0000-00000000a602', null, true),
  ('00000000-0000-0000-0000-0000000000f3', 'nouveau@exemple.be', false),
  ('00000000-0000-0000-0000-0000000000ff', 'intrus@exemple.be', false)
on conflict do nothing;
insert into public.formateurs (id, email) values ('00000000-0000-0000-0000-0000000000f3', 'nouveau@exemple.be')
on conflict (id) do update set actif = true, est_admin = false;

-- ===== A. Code par défaut, personnalisé, doublon =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
insert into public.quiz (id, formateur_id, titre) values
  ('60000000-0000-0000-0000-000000000001', auth.uid(), 'Quiz code permanent'),
  ('60000000-0000-0000-0000-000000000002', auth.uid(), 'Autre quiz');
select test.verifier((select code ~ '^[A-Z2-9]{6}$' from public.quiz where id = '60000000-0000-0000-0000-000000000001'), 'code par défaut attribué (6 caractères sans ambiguïté)');
select test.verifier((select count(distinct code) = count(*) from public.quiz), 'tous les codes de quiz sont uniques');
select test.verifier((select code from public.quiz where id = '60000000-0000-0000-0000-000000000001') <> (select code from public.quiz where id = '60000000-0000-0000-0000-000000000002'), 'deux quiz, deux codes');
update public.quiz set code = '  iabases ' where id = '60000000-0000-0000-0000-000000000001';
select test.verifier((select code from public.quiz where id = '60000000-0000-0000-0000-000000000001') = 'IABASES', 'code personnalisé normalisé en majuscules, espaces retirés');
update public.quiz set code = 'IABASES' where id = '60000000-0000-0000-0000-000000000001';
select test.doit_echouer($$update public.quiz set code = 'iabases' where id = '60000000-0000-0000-0000-000000000002'$$,
  'Ce code est déjà utilisé par un autre quiz. Choisis-en un autre.');
select test.doit_echouer($$update public.quiz set code = 'AB' where id = '60000000-0000-0000-0000-000000000002'$$, 'de 4 à 10 caractères');
select test.doit_echouer($$update public.quiz set code = 'ÉCOLE-IA' where id = '60000000-0000-0000-0000-000000000002'$$, 'de 4 à 10 caractères');
select test.doit_echouer($$update public.quiz set code = 'ABCDEFGHIJK' where id = '60000000-0000-0000-0000-000000000002'$$, 'de 4 à 10 caractères');

-- ===== B. Contraintes de max_reponses =====
insert into public.questions (quiz_id, ordre, type, enonce, max_reponses) values
  ('60000000-0000-0000-0000-000000000001', 1, 'ouverte', 'Citez des usages de l''IA', 3);
insert into public.questions (quiz_id, ordre, type, enonce, choix, bonne_reponse, duree_secondes) values
  ('60000000-0000-0000-0000-000000000001', 2, 'qcm', 'Une IA peut-elle se tromper ?', '{Oui,Non}', 0, 30);
insert into public.questions (quiz_id, ordre, type, enonce) values
  ('60000000-0000-0000-0000-000000000001', 3, 'ouverte', 'Un mot de conclusion');
select test.doit_echouer($$insert into public.questions (quiz_id, ordre, type, enonce, choix, bonne_reponse, max_reponses)
  values ('60000000-0000-0000-0000-000000000001', 4, 'qcm', 'X', '{A,B}', 0, 2)$$, 'questions_max_reponses_coherent');
select test.doit_echouer($$insert into public.questions (quiz_id, ordre, type, enonce, max_reponses)
  values ('60000000-0000-0000-0000-000000000001', 4, 'nuage', 'X', 2)$$, 'questions_max_reponses_coherent');
select test.doit_echouer($$insert into public.questions (quiz_id, ordre, type, enonce, max_reponses)
  values ('60000000-0000-0000-0000-000000000001', 4, 'ouverte', 'X', 11)$$, 'max_reponses');
select test.doit_echouer($$insert into public.questions (quiz_id, ordre, type, enonce, max_reponses)
  values ('60000000-0000-0000-0000-000000000001', 4, 'ouverte', 'X', 0)$$, 'max_reponses');
select test.verifier((select max_reponses from public.questions where quiz_id = '60000000-0000-0000-0000-000000000001' and ordre = 3) = 1, 'max_reponses vaut 1 par défaut');
-- le quiz « Autre quiz » a une question pour pouvoir être lancé
insert into public.questions (quiz_id, ordre, type, enonce) values ('60000000-0000-0000-0000-000000000002', 1, 'ouverte', 'Q');
reset role;

-- ===== Avant tout lancement : « pas encore commencé » (P0001) ≠ « code inconnu » (P0002) =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a601', false);
set role authenticated;
select test.doit_echouer_code($$select public.infos_session('iabases')$$, 'P0001');
select test.doit_echouer($$select public.infos_session('iabases')$$, 'Le quiz n''a pas encore commencé. Attends le signal de ton formateur, puis réessaie.');
select test.doit_echouer_code($$select public.rejoindre_session(' IABASES ', 'Alice')$$, 'P0001');
select test.doit_echouer_code($$select public.infos_session('ZZZZZZ')$$, 'P0002');
select test.doit_echouer_code($$select public.rejoindre_session('ZZZZZZ', 'Alice')$$, 'P0002');
reset role;

-- ===== Lancement, puis relancement : l'ancienne session est archivée =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select set_config('test.s1', public.lancer_session('60000000-0000-0000-0000-000000000001')->>'session_id', false);
select test.verifier((select code from public.sessions where id = current_setting('test.s1')::uuid) = 'IABASES', 'la session prend le code du quiz');
select test.verifier((select max_reponses from public.questions_session where session_id = current_setting('test.s1')::uuid and ordre = 1) = 3, 'max_reponses copié dans la session');
select public.ouvrir_question(current_setting('test.s1')::uuid);   -- question en cours au moment du relancement
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a601', false);
set role authenticated;
select public.rejoindre_session('IABASES', 'Ancienne');
select public.repondre((select question_courante_id from public.sessions where id = current_setting('test.s1')::uuid), '"vieille réponse"');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select set_config('test.s2', public.lancer_session('60000000-0000-0000-0000-000000000001', true, '{T1,T2}')->>'session_id', false);
select test.verifier(current_setting('test.s1') <> current_setting('test.s2'), 'relancer crée une nouvelle session');
select test.verifier((select etat = 'terminee' and terminee_le is not null from public.sessions where id = current_setting('test.s1')::uuid), 'la session précédente est archivée');
select test.verifier((select fermee_le is not null from public.questions_session where session_id = current_setting('test.s1')::uuid and ordre = 1), 'la question en cours de l''ancienne session a été fermée');
select test.verifier((select count(*) from public.sessions where code = 'IABASES' and etat <> 'terminee') = 1, 'une seule session non terminée par code');
select test.verifier((select code from public.sessions where id = current_setting('test.s2')::uuid) = 'IABASES', 'la nouvelle session porte le même code');
select test.verifier((select code from public.quiz where id = '60000000-0000-0000-0000-000000000001') = 'IABASES', 'le quiz garde son code');
-- sécurité : l'index unique partiel refuse deux sessions non terminées avec le même code
reset role;
select test.doit_echouer($$insert into public.sessions (formateur_id, quiz_id, titre, code)
  values ('00000000-0000-0000-0000-00000000000f', '60000000-0000-0000-0000-000000000001', 'doublon', 'IABASES')$$, 'sessions_code_actif_unique');
-- ... mais autorise un code déjà porté par une session terminée
select test.verifier((select count(*) from public.sessions where code = 'IABASES') = 2, 'l''archive garde son code, sans conflit');

-- ===== infos_session / rejoindre_session visent la nouvelle session =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a601', false);
set role authenticated;
select test.verifier((public.infos_session('iabases')->>'session_id') = current_setting('test.s2'), 'infos_session vise la nouvelle session');
select test.doit_echouer(format('select public.rejoindre_session(%L, %L)', 'IABASES', 'Alice'), 'table');
select test.verifier((public.rejoindre_session('iabases', 'Alice', (public.infos_session('iabases')->'tables'->0->>'id')::uuid)->>'session_id') = current_setting('test.s2'), 'rejoindre_session vise la nouvelle session (nouveau pseudo)');
select test.verifier((select count(*) from public.participants where session_id = current_setting('test.s2')::uuid) = 1, 'nouveau participant dans la nouvelle session');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a602', false);
set role authenticated;
select public.rejoindre_session('IABASES', 'Bruno', (public.infos_session('IABASES')->'tables'->1->>'id')::uuid);
reset role;

-- ===== Duplication : insertion sans code = nouveau code =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
insert into public.quiz (id, formateur_id, titre, description)
  select '60000000-0000-0000-0000-000000000003', formateur_id, titre || ' (copie)', description
  from public.quiz where id = '60000000-0000-0000-0000-000000000001';
select test.verifier((select code ~ '^[A-Z2-9]{6}$' and code <> 'IABASES' from public.quiz where id = '60000000-0000-0000-0000-000000000003'), 'duplication : la copie reçoit un nouveau code');

-- ===== B. Question ouverte, 3 réponses par participant =====
select public.ouvrir_question(current_setting('test.s2')::uuid);
select set_config('test.q1', (select question_courante_id::text from public.sessions where id = current_setting('test.s2')::uuid), false);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a601', false);
set role authenticated;
select test.verifier((public.etat_session(current_setting('test.s2')::uuid)->'question'->>'max_reponses')::int = 3, 'etat_session : question.max_reponses');
select test.verifier((public.repondre(current_setting('test.q1')::uuid, '"Résumer"')->>'rang')::int = 1, 'envoi 1 : rang 1');
select test.verifier(not (public.etat_session(current_setting('test.s2')::uuid)->>'a_repondu')::boolean
  and public.etat_session(current_setting('test.s2')::uuid)->'mes_reponses' = '["Résumer"]', 'après 1 envoi : a_repondu faux, mes_reponses = 1 texte');
select public.repondre(current_setting('test.q1')::uuid, '"Traduire"');
select test.verifier(not (public.etat_session(current_setting('test.s2')::uuid)->>'a_repondu')::boolean, 'après 2 envois : a_repondu toujours faux');
select test.verifier((public.repondre(current_setting('test.q1')::uuid, '"Rédiger"')->>'rang')::int = 3, 'envoi 3 : rang 3');
select test.doit_echouer(format('select public.repondre(%L, %L)', current_setting('test.q1'), '"Un quatrième"'), 'Tu as déjà envoyé tes 3 réponses.');
select test.verifier((public.etat_session(current_setting('test.s2')::uuid)->>'a_repondu')::boolean, 'au maximum : a_repondu vrai');
select test.verifier(public.etat_session(current_setting('test.s2')::uuid)->'mes_reponses' = '["Résumer","Traduire","Rédiger"]', 'mes_reponses dans l''ordre d''envoi');
select test.doit_echouer(format('select public.repondre(%L, %L)', current_setting('test.q1'), '"   "'), 'entre 1 et 280');
select test.verifier((select count(*) from public.reponses where question_id = current_setting('test.q1')::uuid) = 3, 'les 3 réponses sont en base (le participant ne lit que les siennes)');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a602', false);
set role authenticated;
select public.repondre(current_setting('test.q1')::uuid, '"Classer"');
select test.verifier(not (public.etat_session(current_setting('test.s2')::uuid)->>'a_repondu')::boolean, 'B : une réponse sur 3 → a_repondu faux');
select test.verifier((select count(*) from public.reponses) = 1, 'B ne lit que sa propre réponse');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select test.verifier((public.etat_session(current_setting('test.s2')::uuid)->'question'->>'nb_reponses')::int = 2
  and (public.etat_session(current_setting('test.s2')::uuid)->'question'->>'nb_reponses_total')::int = 4, 'pendant la question : nb_reponses = personnes (2), nb_reponses_total = 4');
select test.verifier((public.etat_session(current_setting('test.s2')::uuid)->'jauge'->>'points')::int = 2, 'jauge : 3 réponses ouvertes d''une personne = 1 participation (2 participations pour 4 réponses)');
select public.fermer_question(current_setting('test.s2')::uuid);
select test.verifier(jsonb_array_length(public.resultats_question(current_setting('test.q1')::uuid)->'reponses') = 4
  and (public.resultats_question(current_setting('test.q1')::uuid)->>'nb_reponses')::int = 4
  and (public.resultats_question(current_setting('test.q1')::uuid)->>'nb_participants_ayant_repondu')::int = 2, 'resultats_question : toutes les réponses, 4 réponses, 2 participants');
select test.verifier(not (public.resultats_question(current_setting('test.q1')::uuid)::text like '%Alice%'), 'resultats_question : aucun pseudo');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a601', false);
set role authenticated;
select test.verifier(public.resultats_question(current_setting('test.q1')::uuid)->'ma_reponse' = '"Résumer"'
  and public.resultats_question(current_setting('test.q1')::uuid)->'mes_reponses' = '["Résumer","Traduire","Rédiger"]'
  and (public.resultats_question(current_setting('test.q1')::uuid)->>'ma_contribution')::int = 1, 'resultats_question participant : ma_reponse = la première, mes_reponses = toutes');
select test.verifier((public.etat_session(current_setting('test.s2')::uuid)->'resultats'->>'nb_participants_ayant_repondu')::int = 2, 'etat_session : résultats complets');
reset role;

-- ===== Q2 (QCM) et Q3 (ouverte, 1 réponse) =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select public.ouvrir_question(current_setting('test.s2')::uuid);
select set_config('test.q2', (select question_courante_id::text from public.sessions where id = current_setting('test.s2')::uuid), false);
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a601', false);
set role authenticated;
select public.repondre(current_setting('test.q2')::uuid, '0');
select test.doit_echouer(format('select public.repondre(%L, %L)', current_setting('test.q2'), '0'), 'Tu as déjà répondu à cette question.');
select test.verifier(jsonb_typeof(public.etat_session(current_setting('test.s2')::uuid)->'mes_reponses') is null, 'QCM : pas de mes_reponses dans l''état');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a602', false);
set role authenticated;
select public.repondre(current_setting('test.q2')::uuid, '0');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select public.ouvrir_question(current_setting('test.s2')::uuid);   -- ferme Q2, ouvre Q3
select set_config('test.q3', (select question_courante_id::text from public.sessions where id = current_setting('test.s2')::uuid), false);
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a601', false);
set role authenticated;
select public.repondre(current_setting('test.q3')::uuid, '"Merci"');
select test.doit_echouer(format('select public.repondre(%L, %L)', current_setting('test.q3'), '"Encore"'), 'Tu as déjà répondu à cette question.');
select test.verifier((public.etat_session(current_setting('test.s2')::uuid)->>'a_repondu')::boolean, 'ouverte à 1 réponse : a_repondu vrai dès la première');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a602', false);
set role authenticated;
select public.repondre(current_setting('test.q3')::uuid, '"Bravo"');
reset role;

-- ===== Bilan : jauge, « a répondu à tout », mon_score =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select public.passer_au_bilan(current_setting('test.s2')::uuid);
-- 6 participations (3 questions × 2 personnes) + 2 QCM justes ; maximum 2 × (1 + 2 + 1)
select test.verifier((public.etat_session(current_setting('test.s2')::uuid)->'jauge'->>'points')::int = 8
  and (public.etat_session(current_setting('test.s2')::uuid)->'jauge'->>'maximum')::int = 8, 'jauge : 7 réponses supplémentaires ne comptent pas, 8 points sur 8');
select test.verifier((select count(*) from public.mentions where type = 'a_repondu_a_tout' and session_id = current_setting('test.s2')::uuid) = 2, '« a répondu à tout » : 2 personnes (même avec 3 réponses sur une question)');
select test.verifier((select count(*) from public.export_session(current_setting('test.s2')::uuid) where question_ordre = 1) = 4, 'export : une ligne par réponse');
select test.verifier((select string_agg(reponse, ',' order by question_ordre, pseudo) from (
  select question_ordre, pseudo, reponse from public.export_session(current_setting('test.s2')::uuid) where question_ordre = 1 and pseudo = 'Alice' order by 1, 2) x) is not null, 'export : réponses de Alice présentes');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a601', false);
set role authenticated;
select test.verifier(public.etat_session(current_setting('test.s2')::uuid)->'mon_score'
  = '{"questions_posees": 3, "reponses_donnees": 3, "qcm_poses": 1, "qcm_justes": 1, "qcm_presque": 0, "contribution": 4}'::jsonb, 'mon_score : une réponse par question distincte (5 réponses envoyées)');
reset role;

-- ===== Archivage =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select test.verifier(public.archiver_session(current_setting('test.s2')::uuid)->>'etat' = 'terminee', 'archiver_session par le formateur animateur');
select test.verifier((select etat = 'terminee' from public.sessions where id = current_setting('test.s2')::uuid), 'session archivée');
select public.archiver_session(current_setting('test.s2')::uuid);  -- idempotent
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a601', false);
set role authenticated;
select test.doit_echouer_code($$select public.infos_session('IABASES')$$, 'P0001');
select test.doit_echouer(format('select public.archiver_session(%L)', current_setting('test.s2')), 'n''animes pas');
reset role;

-- Un autre formateur lance son quiz ; ni un intrus, ni un autre formateur non admin, mais l'admin peut l'archiver
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f3', false);
set role authenticated;
insert into public.quiz (id, formateur_id, titre, code) values ('60000000-0000-0000-0000-000000000009', auth.uid(), 'Quiz F3', 'f3code');
insert into public.questions (quiz_id, ordre, type, enonce) values ('60000000-0000-0000-0000-000000000009', 1, 'ouverte', 'Q');
select test.doit_echouer($$update public.quiz set code = 'IABASES' where id = '60000000-0000-0000-0000-000000000009'$$, 'déjà utilisé par un autre quiz');
select set_config('test.s9', public.lancer_session('60000000-0000-0000-0000-000000000009')->>'session_id', false);
select test.verifier((select code from public.sessions where id = current_setting('test.s9')::uuid) = 'F3CODE', 'code personnalisé minuscules → F3CODE');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ff', false);
set role authenticated;
select test.doit_echouer(format('select public.archiver_session(%L)', current_setting('test.s9')), 'n''animes pas');
reset role;
-- Un code tenu par une session en cours (autre quiz) ne peut pas être pris
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select test.doit_echouer($$update public.quiz set code = 'F3CODE' where id = '60000000-0000-0000-0000-000000000002'$$, 'déjà utilisé par un autre quiz');
select test.verifier(public.archiver_session(current_setting('test.s9')::uuid)->>'etat' = 'terminee', 'archiver_session par un admin');
reset role;
select test.verifier((select etat = 'terminee' from public.sessions where id = current_setting('test.s9')::uuid), 'session de F3 archivée par l''admin');
