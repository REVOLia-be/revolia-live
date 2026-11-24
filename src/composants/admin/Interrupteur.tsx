// Interrupteur accessible (rôle « switch ») : cible tactile de 56 px, l'état est écrit en toutes lettres à côté.
export default function Interrupteur({
  actif,
  onChange,
  libelle,
  aide,
  disabled = false,
}: {
  actif: boolean
  onChange: (valeur: boolean) => void
  libelle: string
  aide?: string
  disabled?: boolean
}) {
  return (
    <div className="flex items-start gap-4">
      <button
        type="button"
        role="switch"
        aria-checked={actif}
        aria-label={libelle}
        disabled={disabled}
        onClick={() => onChange(!actif)}
        className="flex min-h-[56px] shrink-0 items-center disabled:opacity-60"
      >
        <span className={`relative inline-block h-8 w-14 rounded-pilule border-2 border-vert transition-colors ${actif ? 'bg-vert' : 'bg-blanc'}`}>
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-pilule transition-all ${actif ? 'left-[26px] bg-blanc' : 'left-0.5 bg-vert'}`}
          />
        </span>
      </button>
      <div className="flex min-h-[56px] flex-col justify-center">
        <span className="text-lg font-semibold">
          {libelle} : {actif ? 'oui' : 'non'}
        </span>
        {aide && <span className="text-base text-discret">{aide}</span>}
      </div>
    </div>
  )
}
