// Logo REVOLia (fichiers fournis dans public/marque). Décoratif : le nom du produit est déjà dans la page.
// « clair » : logo blanc pour fonds foncés (écran présentateur) ; « vif » : vert vif pour fonds blancs.
const FICHIERS = {
  clair: '/marque/logo-blanc.svg',
  vif: '/marque/logo-vert-vif.svg',
}

export default function LogoMarque({ variante, className = '' }: { variante: 'clair' | 'vif'; className?: string }) {
  return <img src={FICHIERS[variante]} alt="REVOLia" className={`block w-auto ${className}`} />
}
