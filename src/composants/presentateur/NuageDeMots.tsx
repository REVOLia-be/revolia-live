// Nuage de mots : la taille de chaque mot dépend du nombre de fois où il a été écrit.
// Disposition simple (flex-wrap centré), apparition progressive, couleurs du thème.
const COULEURS = ['text-blanc', 'text-vertClair']

export default function NuageDeMots({ mots }: { mots: { mot: string; nombre: number }[] }) {
  if (mots.length === 0) return <p className="text-vertClair">Pas encore de mots.</p>
  const maximum = Math.max(...mots.map((m) => m.nombre))

  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-[1.5vw] gap-y-[1vh]">
      {mots.map((m, i) => (
        <li
          key={m.mot}
          className={`animation-apparition font-titre font-bold leading-none ${COULEURS[i % COULEURS.length]}`}
          style={{
            fontSize: `${0.7 + 1.8 * (m.nombre / maximum)}em`, // de 0,7 à 2,5 fois la taille de base
            animationDelay: `${Math.min(i, 30) * 80}ms`,
          }}
          title={`${m.nombre} fois`}
        >
          {m.mot}
        </li>
      ))}
    </ul>
  )
}
