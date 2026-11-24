import { useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import LogoMarque from '../composants/LogoMarque'
import { confirmerNewsletter, type ResultatNewsletter } from '../lib/rapport'

// Page publique de confirmation d'inscription aux nouvelles de REVOLia (lien reçu par email, usage unique).

const PROMESSES = [
  'Un message de temps en temps, jamais d\'avalanche.',
  "Des idées concrètes pour utiliser l'IA au quotidien.",
  'Un lien pour te désinscrire dans chaque message.',
]

function Cadre({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-blanc text-bleuViolet">
      <header className="px-6 py-6">
        <LogoMarque variante="vif" className="h-8" />
      </header>
      <main className="grid flex-1 place-items-center px-5 pb-16 pt-6">
        <div className="w-full max-w-[560px] text-left">{children}</div>
      </main>
      <footer className="border-t border-trait px-6 py-5 text-[13px] text-sourdine">
        REVOLia · <a href="https://revolia.be" className="text-vert underline">revolia.be</a>
      </footer>
    </div>
  )
}

export default function Newsletter() {
  const { jeton } = useParams()
  const [resultat, setResultat] = useState<ResultatNewsletter | 'chargement'>('chargement')

  useEffect(() => {
    if (!jeton) {
      setResultat('invalide')
      return
    }
    let actif = true
    void confirmerNewsletter(jeton).then((r) => actif && setResultat(r))
    return () => {
      actif = false
    }
  }, [jeton])

  if (resultat === 'chargement') {
    return (
      <Cadre>
        <p role="status" className="text-lg">Un instant, on enregistre ton inscription…</p>
      </Cadre>
    )
  }

  if (resultat === 'invalide' || resultat === 'indisponible') {
    return (
      <Cadre>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-vert">Newsletter REVOLia</p>
        <h1 className="mb-4 mt-2.5 text-[34px] leading-[1.1] text-bleuViolet md:text-[44px]">
          {resultat === 'invalide' ? "Ce lien n'est plus valide" : "On n'a pas pu confirmer"}
        </h1>
        <p role="alert" className="text-[17px] leading-[1.7]">
          {resultat === 'invalide'
            ? "Il a peut-être expiré. Tu peux rouvrir ton rapport depuis l'email reçu et cliquer à nouveau sur le bouton d'inscription."
            : 'La connexion a eu un souci. Réessaie dans un instant en rechargeant cette page : ton inscription sera alors enregistrée.'}
        </p>
        {resultat === 'indisponible' && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 min-h-[56px] rounded-[14px] bg-vert px-[26px] text-base font-semibold text-blanc hover:bg-vertFonce"
          >
            Réessayer
          </button>
        )}
      </Cadre>
    )
  }

  const deja = resultat === 'deja'
  return (
    <Cadre>
      <div className="mb-7 grid h-[76px] w-[76px] place-items-center rounded-pilule bg-vert shadow-[0_0_0_10px_var(--couleur-juste)]">
        <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden>
          <path className="coche-confirmation" d="M9 20l7 7 13-15" fill="none" stroke="var(--couleur-blanc)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-vert">Newsletter REVOLia</p>
      <h1 className="mb-4 mt-2.5 text-[34px] leading-[1.1] text-bleuViolet md:text-[44px]">
        {deja ? 'Tu es déjà inscrit(e) !' : "Merci, c'est confirmé !"}
      </h1>
      <p role="status" className="mb-3.5 text-[17px] leading-[1.7]">
        {deja
          ? "Bonne nouvelle : cette adresse reçoit déjà les nouvelles de REVOLia. Il n'y a rien d'autre à faire."
          : 'Merci pour ta confiance. Tu recevras désormais les nouvelles de REVOLia.'}
      </p>
      <ul className="mt-6 border-t border-trait">
        {PROMESSES.map((p) => (
          <li key={p} className="flex gap-3 border-b border-trait py-3.5 text-[15px] text-vertFonce">
            <svg className="mt-px h-[22px] w-[22px] flex-none" viewBox="0 0 22 22" aria-hidden>
              <circle cx="11" cy="11" r="10" fill="none" stroke="var(--couleur-vert)" strokeWidth="1.8" />
              <path d="M6.5 11.5l3 3 6-6.5" fill="none" stroke="var(--couleur-vert)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {p}
          </li>
        ))}
      </ul>
      <a
        href="https://revolia.be"
        className="mt-8 inline-flex min-h-[56px] items-center rounded-[14px] bg-vert px-[26px] text-base font-semibold text-blanc hover:bg-vertFonce"
      >
        Découvrir REVOLia →
      </a>
    </Cadre>
  )
}
