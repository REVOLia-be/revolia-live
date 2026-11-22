// Bloc « Pourquoi ? » du téléphone : carte blanche, filet vert foncé. Rien ne s'affiche si l'explication est vide.
export default function BlocPourquoi({ texte }: { texte?: string | null }) {
  const contenu = texte?.trim()
  if (!contenu) return null
  return (
    <section className="rounded-champ border-2 border-l-8 border-vertFonce bg-blanc px-[18px] py-4">
      <h2 className="mb-1.5 text-[22px] leading-tight">Pourquoi ?</h2>
      <p className="text-base leading-normal [overflow-wrap:anywhere]">{contenu}</p>
    </section>
  )
}
