import type { Config } from 'tailwindcss'

// Toutes les couleurs et polices viennent de src/theme.css (variables CSS).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        vert: 'var(--couleur-vert)',
        vertFonce: 'var(--couleur-vert-fonce)',
        vertClair: 'var(--couleur-vert-clair)',
        bleuViolet: 'var(--couleur-bleu-violet)',
        blanc: 'var(--couleur-blanc)',
        discret: 'var(--couleur-discret)',
        inactif: 'var(--couleur-inactif)',
        doux: 'var(--couleur-doux)',
      },
      fontFamily: {
        titre: 'var(--police-titre)',
        texte: 'var(--police-texte)',
      },
      borderRadius: {
        pilule: 'var(--rayon-pilule)',
        carte: 'var(--rayon-carte)',
        champ: 'var(--rayon-champ)',
      },
    },
  },
  plugins: [],
} satisfies Config
