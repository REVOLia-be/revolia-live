-- Le « Pourquoi ? » peut contenir jusqu'à 800 caractères (demande de JF).
alter table public.questions drop constraint questions_explication_check;
alter table public.questions add constraint questions_explication_check check (char_length(explication) <= 800);
