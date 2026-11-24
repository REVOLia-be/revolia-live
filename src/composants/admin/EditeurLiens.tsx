import { LIMITES_LIEN, MAX_LIENS, type LienSuivi } from '../../lib/rapport'
import Bouton from '../Bouton'

const CHAMP = 'w-full rounded-champ border-2 border-vert bg-blanc px-4 py-3 text-base text-vertFonce placeholder:text-discret'
const PETIT_BOUTON =
  'min-h-[56px] min-w-[56px] rounded-pilule border-2 border-vert bg-blanc px-4 text-base font-semibold text-vert hover:bg-vert hover:text-blanc disabled:border-discret disabled:text-inactif disabled:hover:bg-blanc disabled:hover:text-inactif'

// Éditeur de la liste des liens « Prochaines étapes » : ajouter, retirer, monter, descendre (5 liens au plus).
export default function EditeurLiens({
  liens,
  onChange,
  disabled = false,
}: {
  liens: LienSuivi[]
  onChange: (liens: LienSuivi[]) => void
  disabled?: boolean
}) {
  function modifier(i: number, champ: keyof LienSuivi, valeur: string) {
    onChange(liens.map((l, j) => (j === i ? { ...l, [champ]: valeur } : l)))
  }
  function deplacer(i: number, delta: number) {
    const j = i + delta
    if (j < 0 || j >= liens.length) return
    const copie = [...liens]
    ;[copie[i], copie[j]] = [copie[j], copie[i]]
    onChange(copie)
  }

  return (
    <div className="flex flex-col gap-4">
      {liens.length === 0 && <p className="text-base">Aucun lien pour l'instant. Le bloc « Prochaines étapes » ne montrera rien.</p>}
      {liens.map((l, i) => (
        <fieldset key={i} disabled={disabled} className="flex flex-col gap-3 rounded-champ border-2 border-trait p-4">
          <legend className="px-2 text-base font-semibold">
            Lien n° {i + 1}
            {i === 0 && ' (mis en avant, avec un grand bouton)'}
          </legend>
          <label className="flex flex-col gap-1 text-base font-semibold">
            Titre
            <input className={CHAMP} maxLength={LIMITES_LIEN.titre} value={l.titre} onChange={(e) => modifier(i, 'titre', e.target.value)} placeholder="Rejoins REVOLia Campus" />
          </label>
          <label className="flex flex-col gap-1 text-base font-semibold">
            Une phrase qui donne envie
            <textarea
              className={CHAMP}
              rows={2}
              maxLength={LIMITES_LIEN.texte}
              value={l.texte}
              onChange={(e) => modifier(i, 'texte', e.target.value)}
            />
            <span className="text-sm font-normal text-discret">{l.texte.length} / {LIMITES_LIEN.texte} caractères</span>
          </label>
          <label className="flex flex-col gap-1 text-base font-semibold">
            Adresse du lien (commence par https://)
            <input className={CHAMP} inputMode="url" value={l.url} onChange={(e) => modifier(i, 'url', e.target.value)} placeholder="https://" />
          </label>
          <label className="flex flex-col gap-1 text-base font-semibold">
            Texte du bouton
            <input className={CHAMP} maxLength={LIMITES_LIEN.bouton} value={l.bouton} onChange={(e) => modifier(i, 'bouton', e.target.value)} placeholder="Découvrir REVOLia Campus" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={PETIT_BOUTON} disabled={disabled || i === 0} onClick={() => deplacer(i, -1)} aria-label={`Monter le lien ${i + 1}`}>
              ↑ Monter
            </button>
            <button type="button" className={PETIT_BOUTON} disabled={disabled || i === liens.length - 1} onClick={() => deplacer(i, 1)} aria-label={`Descendre le lien ${i + 1}`}>
              ↓ Descendre
            </button>
            <button type="button" className={`${PETIT_BOUTON} sm:ml-auto`} disabled={disabled} onClick={() => onChange(liens.filter((_, j) => j !== i))}>
              Retirer ce lien
            </button>
          </div>
        </fieldset>
      ))}
      <Bouton
        type="button"
        variante="secondaire"
        className="sm:w-auto"
        disabled={disabled || liens.length >= MAX_LIENS}
        onClick={() => onChange([...liens, { titre: '', texte: '', url: 'https://', bouton: '' }])}
      >
        Ajouter un lien
      </Bouton>
      {liens.length >= MAX_LIENS && <p className="text-base">Tu as atteint le maximum de {MAX_LIENS} liens.</p>}
    </div>
  )
}
