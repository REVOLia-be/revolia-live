-- Espace admin : l'admin gère tout, un formateur ne voit que ses quiz.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000f2', 'formateur2@exemple.be', false),
  ('00000000-0000-0000-0000-0000000000f3', 'nouveau@exemple.be', false);
insert into public.formateurs (id, email) values ('00000000-0000-0000-0000-0000000000f2', 'formateur2@exemple.be');
update public.formateurs set est_admin = true where id = '00000000-0000-0000-0000-00000000000f';

-- Formateur 2 crée un quiz
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
set role authenticated;
insert into public.quiz (id, formateur_id, titre) values ('30000000-0000-0000-0000-000000000001', auth.uid(), 'Quiz F2');
insert into public.questions (quiz_id, ordre, type, enonce, choix, bonne_reponse) values ('30000000-0000-0000-0000-000000000001', 1, 'qcm', 'X', '{A,B}', 0);
select test.verifier((select count(*) from public.quiz where formateur_id <> auth.uid()) = 0, 'formateur 2 ne voit pas les quiz des autres');
select test.doit_echouer('select * from public.admin_liste_formateurs()', 'administrateurs');
select test.doit_echouer($$select public.admin_ajouter_formateur('nouveau@exemple.be')$$, 'administrateurs');
reset role;

-- L'admin voit et modifie le quiz de F2, gère les formateurs
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
set role authenticated;
select test.verifier((select count(*) from public.quiz where id = '30000000-0000-0000-0000-000000000001') = 1, 'admin voit le quiz de F2');
update public.quiz set titre = 'Quiz F2 corrigé' where id = '30000000-0000-0000-0000-000000000001';
update public.questions set enonce = 'Y' where quiz_id = '30000000-0000-0000-0000-000000000001';
select test.verifier((select titre from public.quiz where id = '30000000-0000-0000-0000-000000000001') = 'Quiz F2 corrigé', 'admin modifie le quiz de F2');
select test.verifier((select count(*) from public.admin_liste_formateurs()) = 2, 'admin liste les formateurs');
select test.doit_echouer($$select public.admin_ajouter_formateur('inconnu@exemple.be')$$, 'se connecter une fois');
select public.admin_ajouter_formateur('Nouveau@Exemple.be');
select test.verifier((select count(*) from public.admin_liste_formateurs()) = 3, 'admin ajoute un formateur (email insensible à la casse)');
select test.doit_echouer($$select public.admin_modifier_formateur('00000000-0000-0000-0000-00000000000f', true, false)$$, 'toi-même');
select public.admin_modifier_formateur('00000000-0000-0000-0000-0000000000f2', false, false);
select test.doit_echouer($$select public.lancer_session('30000000-0000-0000-0000-000000000001')$$, 'introuvable');
reset role;

-- F2 désactivé : ne voit plus ni ne crée de quiz, ne lance plus
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
set role authenticated;
select test.verifier((select count(*) from public.quiz) = 0, 'formateur désactivé ne voit plus ses quiz');
select test.doit_echouer($$insert into public.quiz (formateur_id, titre) values (auth.uid(), 'interdit')$$, 'row-level security');
select test.doit_echouer($$select public.lancer_session('30000000-0000-0000-0000-000000000001')$$, 'introuvable');
reset role;
select test.verifier((select count(*) from public.quiz where id = '30000000-0000-0000-0000-000000000001') = 1, 'les quiz du formateur désactivé sont conservés');
