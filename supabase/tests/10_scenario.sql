-- Scénario de bout en bout : formateur, deux participants, un intrus.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on

create schema test;
-- Vérifie qu'une instruction échoue avec un message contenant `attendu`.
create function test.doit_echouer(sql text, attendu text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'ÉCHEC : aurait dû échouer → %', sql;
exception when others then
  if sqlerrm like 'ÉCHEC%' or sqlerrm not ilike '%' || attendu || '%' then
    raise exception 'ÉCHEC : % → message inattendu : %', sql, sqlerrm;
  end if;
end $$;
create function test.verifier(condition boolean, libelle text) returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception 'ÉCHEC : %', libelle; end if;
  raise notice 'ok  %', libelle;
end $$;
grant usage on schema test to authenticated;

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000f', 'formateur@exemple.be', false),
  ('00000000-0000-0000-0000-00000000000a', null, true),
  ('00000000-0000-0000-0000-00000000000b', null, true),
  ('00000000-0000-0000-0000-00000000000c', null, true),
  ('00000000-0000-0000-0000-0000000000ff', 'intrus@exemple.be', false);
insert into public.formateurs (id, email) values ('00000000-0000-0000-0000-00000000000f', 'formateur@exemple.be');

-- ===== Formateur : crée un quiz et lance une session =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
insert into public.quiz (id, formateur_id, titre)
  values ('10000000-0000-0000-0000-000000000001', auth.uid(), 'Quiz test');
insert into public.questions (quiz_id, ordre, type, enonce, choix, bonne_reponse, duree_secondes) values
  ('10000000-0000-0000-0000-000000000001', 1, 'qcm',     'Q1', '{A,B,C}', 1, 30),
  ('10000000-0000-0000-0000-000000000001', 2, 'qcm',     'Q2', '{A,B}',   0, 30),
  ('10000000-0000-0000-0000-000000000001', 3, 'nuage',   'Q3', null, null, 30),
  ('10000000-0000-0000-0000-000000000001', 4, 'ouverte', 'Q4', null, null, 30),
  ('10000000-0000-0000-0000-000000000001', 5, 'echelle', 'Q5', null, null, 30),
  ('10000000-0000-0000-0000-000000000001', 6, 'qcm',     'Q6', '{A,B}',   1, 30),
  ('10000000-0000-0000-0000-000000000001', 7, 'qcm',     'Q7', '{A,B}',   1, 30);
update public.questions set explication = 'Parce que B.' where ordre = 1;
-- QCM à plusieurs bonnes réponses : Q8 avec annonce du nombre, Q9 sans
insert into public.questions (quiz_id, ordre, type, enonce, choix, bonnes_reponses, annoncer_nombre, duree_secondes) values
  ('10000000-0000-0000-0000-000000000001', 8, 'qcm_multiple', 'Q8', '{A,B,C,D}', '{0,2}',   true,  30),
  ('10000000-0000-0000-0000-000000000001', 9, 'qcm_multiple', 'Q9', '{A,B,C,D}', '{1,2,3}', false, 30);
select test.doit_echouer($$insert into public.questions (quiz_id, ordre, type, enonce, choix, bonnes_reponses)
  values ('10000000-0000-0000-0000-000000000001', 10, 'qcm_multiple', 'X', '{A,B,C}', '{1}')$$, 'qcm_coherent');
select test.doit_echouer($$insert into public.questions (quiz_id, ordre, type, enonce, choix, bonnes_reponses)
  values ('10000000-0000-0000-0000-000000000001', 10, 'qcm_multiple', 'X', '{A,B,C}', '{0,3}')$$, 'qcm_coherent');
select test.doit_echouer($$insert into public.questions (quiz_id, ordre, type, enonce, choix, bonnes_reponses)
  values ('10000000-0000-0000-0000-000000000001', 10, 'qcm_multiple', 'X', '{A,B,C}', '{1,1}')$$, 'qcm_coherent');
select test.doit_echouer($$insert into public.questions (quiz_id, ordre, type, enonce, choix, bonne_reponse, bonnes_reponses)
  values ('10000000-0000-0000-0000-000000000001', 10, 'qcm_multiple', 'X', '{A,B,C}', 0, '{1,2}')$$, 'qcm_coherent');
select test.doit_echouer($$insert into public.questions (quiz_id, ordre, type, enonce, bonnes_reponses)
  values ('10000000-0000-0000-0000-000000000001', 10, 'nuage', 'X', '{1,2}')$$, 'qcm_coherent');
update public.quiz set celebrations = '[{"apres_question": 1, "message": "Premier pas, bravo la salle !"}]';
select test.doit_echouer($$update public.quiz set celebrations = '[{"apres_question": 1, "message": "a"}, {"apres_question": 1, "message": "b"}]'$$, 'quiz_celebrations_valides');
select test.doit_echouer($$update public.quiz set celebrations = '[{"apres_question": 0, "message": "a"}]'$$, 'quiz_celebrations_valides');
select test.doit_echouer($$insert into public.questions (quiz_id, ordre, type, enonce, choix, bonne_reponse)
  values ('10000000-0000-0000-0000-000000000001', 8, 'qcm', 'X', '{A,B}', 5)$$, 'qcm_coherent');
select set_config('test.session', (public.lancer_session('10000000-0000-0000-0000-000000000001', true, '{Table 1,Table 2}')->>'session_id'), false);
select set_config('test.code', (select code from public.sessions where id = current_setting('test.session')::uuid), false);
select set_config('test.table1', (select id::text from public.tables_salle where ordre = 1), false);
select test.verifier((select count(*) from public.questions_session) = 9, 'questions copiées à la session');
select test.verifier((select count(*) from public.questions_session where type = 'qcm_multiple' and bonnes_reponses is not null) = 2
  and (select annoncer_nombre from public.questions_session where ordre = 8) and not (select annoncer_nombre from public.questions_session where ordre = 9),
  'bonnes_reponses et annoncer_nombre copiés à la session');
select test.verifier(jsonb_array_length((select celebrations from public.sessions)) = 1, 'célébrations du quiz copiées dans la session');
reset role;

-- ===== Intrus (connecté mais pas formateur) =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ff', false);
set role authenticated;
select test.doit_echouer($$insert into public.quiz (formateur_id, titre) values (auth.uid(), 'pirate')$$, 'row-level security');
select test.doit_echouer(format('select public.ouvrir_question(%L)', current_setting('test.session')), 'n''animes pas');
select test.verifier((select count(*) from public.quiz) = 0, 'intrus ne voit aucun quiz');
reset role;

-- ===== Participant A rejoint =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
set role authenticated;
select test.verifier((public.infos_session(lower(current_setting('test.code')))->'tables'->0->>'nom') = 'Table 1', 'infos_session (code en minuscules accepté)');
select test.doit_echouer(format('select public.rejoindre_session(%L, %L)', current_setting('test.code'), 'Alice'), 'table');
select public.rejoindre_session(current_setting('test.code'), '  Alice  ', current_setting('test.table1')::uuid);
select test.verifier((select pseudo from public.participants) = 'Alice', 'pseudo nettoyé');
-- revenir après une coupure : même fiche
select public.rejoindre_session(current_setting('test.code'), 'Alice', current_setting('test.table1')::uuid);
select test.verifier((select count(*) from public.participants) = 1, 'reconnexion = même participant');
select test.verifier((select count(*) from public.questions_session) = 0, 'participant ne lit PAS les questions (solutions)');
select test.verifier((select count(*) from public.sessions) = 1, 'participant lit sa session');
select test.doit_echouer('select public.repondre((select question_courante_id from public.sessions), ''1'')', '');
reset role;

-- ===== Participant B =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
set role authenticated;
select test.doit_echouer(format('select public.rejoindre_session(%L, %L, %L)', current_setting('test.code'), 'ALICE', current_setting('test.table1')), 'déjà pris');
select public.rejoindre_session(current_setting('test.code'), 'Bob', current_setting('test.table1')::uuid);
select test.verifier((select count(*) from public.participants) = 1, 'B ne voit que sa propre fiche');
reset role;

-- Procédure de jeu : le formateur ouvre, chacun répond, le formateur ferme.
create function test.jouer(a jsonb, b jsonb) returns void language plpgsql as $$
declare q uuid;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', true);
  perform public.ouvrir_question(current_setting('test.session')::uuid);
  select question_courante_id into q from public.sessions where id = current_setting('test.session')::uuid;
  if a is not null then
    perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
    perform public.repondre(q, a);
  end if;
  if b is not null then
    perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
    perform public.repondre(q, b);
  end if;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', true);
  perform public.fermer_question(current_setting('test.session')::uuid);
end $$;

-- ===== Question 1 en détail =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select public.ouvrir_question(current_setting('test.session')::uuid);
select set_config('test.q1', (select question_courante_id::text from public.sessions), false);
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
set role authenticated;
select test.verifier(not (public.etat_session(current_setting('test.session')::uuid)->'question' ? 'bonne_reponse'), 'etat_session ne révèle pas la solution');
select test.doit_echouer(format('select public.repondre(%L, %L)', current_setting('test.q1'), '7'), 'invalide');
select public.repondre(current_setting('test.q1')::uuid, '1');
select test.doit_echouer(format('select public.repondre(%L, %L)', current_setting('test.q1'), '1'), 'déjà répondu');
select test.verifier((select est_correcte is null from public.reponses), 'est_correcte reste vide pendant la question');
select test.doit_echouer(format('select public.resultats_question(%L)', current_setting('test.q1')), 'fin de la question');
select test.doit_echouer(format($$insert into public.reponses (session_id, question_id, participant_id, valeur, temps_ms)
  values (%L, %L, (select id from public.participants), '2', 0)$$, current_setting('test.session'), current_setting('test.q1')), 'permission denied');
select test.doit_echouer($$update public.sessions set etat = 'bilan'$$, 'permission denied');
select test.verifier((select etat from public.sessions) = 'question', 'participant ne peut pas modifier la session');
reset role;
-- B répond trop tard
update public.sessions set fin_reponses_le = now() - interval '5 seconds';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
set role authenticated;
select test.doit_echouer(format('select public.repondre(%L, %L)', current_setting('test.q1'), '0'), 'temps est écoulé');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select public.fermer_question(current_setting('test.session')::uuid);
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
set role authenticated;
select test.verifier((public.etat_session(current_setting('test.session')::uuid)->'resultats'->>'est_correcte')::boolean, 'A voit sa bonne réponse après fermeture');
select test.verifier((public.resultats_question(current_setting('test.q1')::uuid)->>'ma_contribution')::int = 2, 'contribution QCM juste = 2');
select test.verifier(public.resultats_question(current_setting('test.q1')::uuid)->'repartition' = '[0,1,0]', 'répartition QCM');
select test.verifier(public.resultats_question(current_setting('test.q1')::uuid)->>'explication' = 'Parce que B.', 'explication révélée après fermeture');
select test.verifier(public.etat_session(current_setting('test.session')::uuid)->>'celebration' = 'Premier pas, bravo la salle !', 'célébration affichée après la question 1');
reset role;

-- ===== Questions 2 à 7 (B : faux au début, juste à la fin → progression) =====
set role authenticated;
select test.jouer('0', '1');            -- Q2 qcm : A juste, B faux
select test.jouer('"  Clarté  "', '"clarté"');  -- Q3 nuage
select test.jouer('"Super journée"', '"Très utile"'); -- Q4 ouverte
select test.jouer('4', '5');            -- Q5 échelle
select test.jouer('1', '1');            -- Q6 qcm
select test.jouer(null, '1');           -- Q7 qcm : A ne répond pas

-- ===== Q8 : QCM multiple AVEC annonce (bonnes : A et C) =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
select public.ouvrir_question(current_setting('test.session')::uuid);
select set_config('test.q8', (select question_courante_id::text from public.sessions), false);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select test.verifier((public.etat_session(current_setting('test.session')::uuid)->'question'->>'nb_bonnes')::int = 2, 'Q8 : nb_bonnes annoncé');
select test.verifier(not (public.etat_session(current_setting('test.session')::uuid)::text like '%bonnes_reponses%'), 'Q8 : etat_session ne contient pas les indices');
select test.doit_echouer(format('select public.repondre(%L, %L)', current_setting('test.q8'), '[1]'), 'exactement 2');
select test.doit_echouer(format('select public.repondre(%L, %L)', current_setting('test.q8'), '[0,1,2]'), 'exactement 2');
select test.doit_echouer(format('select public.repondre(%L, %L)', current_setting('test.q8'), '[1,1]'), 'une seule fois');
select test.doit_echouer(format('select public.repondre(%L, %L)', current_setting('test.q8'), '[0,4]'), 'invalide');
select test.doit_echouer(format('select public.repondre(%L, %L)', current_setting('test.q8'), '[0,-1]'), 'invalide');
select test.doit_echouer(format('select public.repondre(%L, %L)', current_setting('test.q8'), '[0,"1"]'), 'invalide');
select test.doit_echouer(format('select public.repondre(%L, %L)', current_setting('test.q8'), '2'), 'invalide');
select test.doit_echouer(format('select public.repondre(%L, %L)', current_setting('test.q8'), '[]'), 'au moins');
select public.repondre(current_setting('test.q8')::uuid, '[2,0]');
select test.verifier((select valeur from public.reponses where question_id = current_setting('test.q8')::uuid) = '[0,2]', 'Q8 : réponse stockée triée');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select public.repondre(current_setting('test.q8')::uuid, '[0,2]');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
select public.fermer_question(current_setting('test.session')::uuid);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select test.verifier(public.resultats_question(current_setting('test.q8')::uuid)->'bonnes_reponses' = '[0,2]' and public.resultats_question(current_setting('test.q8')::uuid)->'repartition' = '[2,0,2,0]' and (public.resultats_question(current_setting('test.q8')::uuid)->>'taux_reussite')::int = 100 and (public.resultats_question(current_setting('test.q8')::uuid)->>'nb_reponses')::int = 2, 'Q8 : résultats (bonnes, répartition, taux)');
select test.verifier((public.resultats_question(current_setting('test.q8')::uuid)->>'est_correcte')::boolean and not (public.resultats_question(current_setting('test.q8')::uuid)->>'presque')::boolean and (public.resultats_question(current_setting('test.q8')::uuid)->>'ma_contribution')::int = 2 and public.resultats_question(current_setting('test.q8')::uuid)->'ma_reponse' = '[0,2]', 'Q8 : réponse exacte = juste, contribution 2');

-- ===== Q9 : QCM multiple SANS annonce (bonnes : B, C et D) =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
select public.ouvrir_question(current_setting('test.session')::uuid);
select set_config('test.q9', (select question_courante_id::text from public.sessions), false);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select test.verifier(jsonb_typeof(public.etat_session(current_setting('test.session')::uuid)->'question'->'nb_bonnes') = 'null', 'Q9 : nb_bonnes absent si non annoncé');
select test.verifier(not (public.etat_session(current_setting('test.session')::uuid)::text like '%bonnes_reponses%'), 'Q9 : etat_session ne contient pas les indices');
select test.doit_echouer(format('select public.repondre(%L, %L)', current_setting('test.q9'), '[]'), 'au moins');
select test.doit_echouer(format('select public.repondre(%L, %L)', current_setting('test.q9'), '[2,2]'), 'une seule fois');
select test.doit_echouer(format('select public.repondre(%L, %L)', current_setting('test.q9'), '[0,4]'), 'invalide');
select test.doit_echouer(format('select public.repondre(%L, %L)', current_setting('test.q9'), '[0,1,2,3,3]'), 'invalide');
select public.repondre(current_setting('test.q9')::uuid, '[3]');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select public.repondre(current_setting('test.q9')::uuid, '[1,0]');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
select public.fermer_question(current_setting('test.session')::uuid);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select test.verifier(public.resultats_question(current_setting('test.q9')::uuid)->'bonnes_reponses' = '[1,2,3]' and public.resultats_question(current_setting('test.q9')::uuid)->'repartition' = '[1,1,0,1]' and (public.resultats_question(current_setting('test.q9')::uuid)->>'taux_reussite')::int = 0, 'Q9 : répartition et taux');
select test.verifier(not (public.resultats_question(current_setting('test.q9')::uuid)->>'est_correcte')::boolean and (public.resultats_question(current_setting('test.q9')::uuid)->>'presque')::boolean and (public.resultats_question(current_setting('test.q9')::uuid)->>'ma_contribution')::int = 1, 'Q9 : partiel sans erreur = presque, contribution 1');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select test.verifier(not (public.resultats_question(current_setting('test.q9')::uuid)->>'est_correcte')::boolean and not (public.resultats_question(current_setting('test.q9')::uuid)->>'presque')::boolean and (public.resultats_question(current_setting('test.q9')::uuid)->>'ma_contribution')::int = 1, 'Q9 : partiel avec une mauvaise = pas presque');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select test.verifier((select (public.resultats_question(id)->'mots'->0->>'nombre')::int from public.questions_session where ordre = 3) = 2, 'nuage : mots normalisés et regroupés');
select test.verifier((select public.resultats_question(id)->>'moyenne' from public.questions_session where ordre = 5) = '4.5', 'échelle : moyenne');
select public.basculer_coup_de_coeur((select r.id from public.reponses r join public.questions_session q on q.id = r.question_id where q.ordre = 4 and r.valeur = '"Très utile"'));
select test.doit_echouer(format('select public.ouvrir_question(%L)', current_setting('test.session')), 'Toutes les questions');
select public.passer_au_bilan(current_setting('test.session')::uuid);
select test.verifier((select count(*) from public.mentions where type = 'a_repondu_a_tout') = 0, 'personne n''a tout répondu (B a raté Q1, A Q7)');
select test.verifier((select p.pseudo from public.mentions m join public.participants p on p.id = m.participant_id where m.type = 'plus_belle_progression') = 'Bob', 'plus belle progression : Bob');
select test.verifier((public.etat_session(current_setting('test.session')::uuid)->'bilan'->'jauge'->>'points')::int = 23, 'jauge : 16 réponses + 7 justes = 23');
select test.verifier((select count(*) from public.export_session(current_setting('test.session')::uuid)) = 16, 'export : 16 lignes');
select test.verifier((select reponse from public.export_session(current_setting('test.session')::uuid) where question_ordre = 8 and pseudo = 'Alice') = 'A ; C'
  and (select reponse from public.export_session(current_setting('test.session')::uuid) where question_ordre = 9 and pseudo = 'Bob') = 'A ; B'
  and (select reponse from public.export_session(current_setting('test.session')::uuid) where question_ordre = 9 and pseudo = 'Alice') = 'D', 'export : libellés cochés joints par « ; »');
select test.verifier(not (public.etat_session(current_setting('test.session')::uuid) ? 'mon_score'), 'formateur : pas de mon_score');
select test.verifier(not ((public.etat_session(current_setting('test.session')::uuid)->'bilan')::text like '%mon_score%'), 'formateur : pas de score individuel dans le bilan');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
set role authenticated;
select test.verifier(jsonb_array_length(public.etat_session(current_setting('test.session')::uuid)->'bilan'->'mentions') = 2, 'B voit le bilan (progression + coup de cœur)');
select test.verifier(public.etat_session(current_setting('test.session')::uuid)->'mon_score'
  = '{"questions_posees": 9, "reponses_donnees": 8, "qcm_poses": 6, "qcm_justes": 3, "qcm_presque": 0, "contribution": 11}'::jsonb, 'B voit SON score (et seulement le sien)');
select test.doit_echouer(format('select * from public.export_session(%L)', current_setting('test.session')), 'n''animes pas');
reset role;

-- ===== Score personnel de A =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
set role authenticated;
select test.verifier(public.etat_session(current_setting('test.session')::uuid)->'mon_score'
  = '{"questions_posees": 9, "reponses_donnees": 8, "qcm_poses": 6, "qcm_justes": 4, "qcm_presque": 1, "contribution": 12}'::jsonb, 'A voit SON score');
reset role;

-- ===== Participant C, jamais inscrit =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
set role authenticated;
select test.doit_echouer(format('select public.etat_session(%L)', current_setting('test.session')), 'ne participes pas');
select test.verifier((select count(*) from public.sessions) = 0, 'C ne voit aucune session');
reset role;

-- ===== RGPD =====
update public.sessions set cree_le = now() - interval '91 days';
update auth.users set created_at = now() - interval '2 days';
select test.verifier((public.purger_donnees_expirees()->>'sessions_supprimees')::int = 1, 'purge : session expirée supprimée');
select test.verifier((select count(*) from public.reponses) = 0 and (select count(*) from public.participants) = 0, 'purge : cascade');
select test.verifier((select count(*) from auth.users where is_anonymous) = 0, 'purge : identités anonymes supprimées');
select test.verifier((select count(*) from auth.users) = 2, 'purge : comptes formateurs conservés');

-- ===== Journal d'utilisation (survit à la purge) =====
select test.verifier((select count(*) from public.journal_usage where type = 'session') = 1, 'journal : session lancée enregistrée');
select test.verifier((select nb_reponses from public.journal_usage where type = 'session') = 16, 'journal : réponses comptées au bilan');
