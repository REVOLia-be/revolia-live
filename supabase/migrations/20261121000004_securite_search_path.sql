-- Recommandation du contrôle de sécurité Supabase : fixer le search_path.
alter function public.poids_max_question(public.type_question) set search_path = '';
