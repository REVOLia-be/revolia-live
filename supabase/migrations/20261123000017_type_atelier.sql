-- =============================================================================
-- Ateliers à son rythme : ajout du type de question `atelier`.
-- Seul dans ce fichier : une nouvelle valeur d'enum ne peut pas être utilisée
-- dans la transaction qui l'ajoute. Tout le reste est dans le fichier suivant.
-- =============================================================================
alter type public.type_question add value if not exists 'atelier';
