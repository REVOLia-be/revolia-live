import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const cleAnonyme = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !cleAnonyme) {
  throw new Error(
    "La connexion à Supabase n'est pas configurée. " +
      'Copie le fichier .env.example en .env.local, remplis VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY, puis relance l\'application.',
  )
}

export const supabase = createClient(url, cleAnonyme)
