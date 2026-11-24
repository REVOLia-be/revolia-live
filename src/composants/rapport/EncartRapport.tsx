import { useState } from 'react'
import { messageErreur } from '../../lib/erreurs'
import { demanderRapport, envoyerRapport } from '../../lib/rapport'
import type { EtatRapport } from '../../lib/session'
import Bouton from '../Bouton'
import { Coche } from '../Pictos'

const cleRepli = (sessionId: string) => `revolia-live:rapport-replie:${sessionId}`

function lireRepli(sessionId: string): boolean {
  try {
    return window.sessionStorage.getItem(cleRepli(sessionId)) === '1'
  } catch {
    return false
  }
}
function ecrireRepli(sessionId: string, valeur: boolean) {
  try {
    if (valeur) window.sessionStorage.setItem(cleRepli(sessionId), '1')
    else window.sessionStorage.removeItem(cleRepli(sessionId))
  } catch {
    // stockage indisponible : l'encart se rouvrira simplement au rechargement
  }
}

type Phase =
  | { nom: 'saisie' }
  | { nom: 'envoi' }
  | { nom: 'envoye'; email: string } // email complet ou masqué
  | { nom: 'lien'; url: string } // envoi d'emails non configuré : lien direct

const MENTION_90 = "Ton email sert uniquement à t'envoyer ce rapport. Il est supprimé avec les données du quiz après 90 jours."

function Confidentialite({ url }: { url: string | null }) {
  if (!url) return null
  return (
    <>
      {' '}
      <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold text-vert underline">
        Confidentialité
      </a>
    </>
  )
}

// Encart de fin de quiz : proposer d'envoyer le rapport par email. Facultatif, jamais bloquant.
export default function EncartRapport({ sessionId, rapport }: { sessionId: string; rapport: EtatRapport }) {
  const [replie, setReplie] = useState(() => lireRepli(sessionId))
  const [phase, setPhase] = useState<Phase>(() =>
    rapport.deja_demande && rapport.email_masque ? { nom: 'envoye', email: rapport.email_masque } : { nom: 'saisie' },
  )
  const [email, setEmail] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  if (!rapport.propose) return null

  if (replie) {
    return (
      <button
        type="button"
        onClick={() => {
          ecrireRepli(sessionId, false)
          setReplie(false)
        }}
        className="min-h-[56px] self-start text-base font-semibold text-vert underline"
      >
        Recevoir mon rapport par email
      </button>
    )
  }

  async function envoyer(e: React.FormEvent) {
    e.preventDefault()
    const adresse = email.trim()
    if (!adresse) {
      setErreur("Écris ton adresse email pour recevoir ton rapport.")
      return
    }
    setErreur(null)
    setPhase({ nom: 'envoi' })
    try {
      const demandeId = await demanderRapport(sessionId, adresse)
      const resultat = await envoyerRapport(demandeId)
      if (resultat.statut === 'envoye') setPhase({ nom: 'envoye', email: adresse })
      else if (resultat.statut === 'indisponible') setPhase({ nom: 'lien', url: resultat.urlRapport })
      else {
        setErreur(resultat.message)
        setPhase({ nom: 'saisie' })
      }
    } catch (err) {
      setErreur(messageErreur(err))
      setPhase({ nom: 'saisie' })
    }
  }

  const base = 'rounded-carte border-2 border-trait bg-blanc px-[18px] py-5 shadow-md'

  if (phase.nom === 'lien') {
    return (
      <section aria-labelledby="titre-rapport" className={base}>
        <h2 id="titre-rapport" className="text-xl leading-snug text-bleuViolet">Ton rapport est prêt</h2>
        <p className="mb-4 mt-1 text-base" role="status">
          L'envoi d'emails n'est pas encore configuré. Ton rapport reste disponible ici.
        </p>
        <a
          href={phase.url}
          className="flex min-h-[56px] w-full items-center justify-center rounded-pilule bg-vert px-8 text-lg font-semibold text-blanc hover:bg-vertFonce"
        >
          Voir mon rapport maintenant
        </a>
      </section>
    )
  }

  if (phase.nom === 'envoye') {
    return (
      <section aria-labelledby="titre-rapport" className={base}>
        <p className="flex items-center gap-3 text-lg font-bold text-vert" role="status">
          <Coche taille={22} />
          <span id="titre-rapport">{rapport.deja_demande && phase.email === rapport.email_masque ? `Rapport envoyé à ${phase.email}` : "C'est envoyé !"}</span>
        </p>
        {!(rapport.deja_demande && phase.email === rapport.email_masque) && (
          <p className="mt-2 text-base">Regarde ta boîte mail (et les indésirables). Il est parti à <strong className="[overflow-wrap:anywhere]">{phase.email}</strong>.</p>
        )}
        <button
          type="button"
          onClick={() => {
            setEmail('')
            setPhase({ nom: 'saisie' })
          }}
          className="mt-2 min-h-[56px] text-base font-semibold text-vert underline"
        >
          Renvoyer le rapport
        </button>
        <p className="text-xs leading-relaxed text-sourdine">
          Ton email est supprimé avec les données du quiz après 90 jours.
          <Confidentialite url={rapport.url_confidentialite} />
        </p>
      </section>
    )
  }

  const occupe = phase.nom === 'envoi'
  return (
    <section aria-labelledby="titre-rapport" className={base}>
      <h2 id="titre-rapport" className="text-xl leading-snug text-bleuViolet">Veux-tu recevoir le rapport de ton quiz par email ?</h2>
      <p className="mb-4 mt-1 text-base text-sourdine">Tes réponses, les bonnes réponses et le « Pourquoi ? », à relire quand tu veux.</p>
      <form onSubmit={envoyer} noValidate className="flex flex-col gap-3">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          aria-label="Ton adresse email"
          placeholder="ton.email@exemple.be"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={occupe}
          className="h-14 w-full rounded-champ border-2 border-vert bg-blanc px-4 text-base text-bleuViolet placeholder:text-sourdine"
        />
        {erreur && (
          <p role="alert" className="text-base font-semibold">
            {erreur}
          </p>
        )}
        <Bouton type="submit" disabled={occupe}>
          {occupe ? 'Envoi en cours…' : "M'envoyer mon rapport"}
        </Bouton>
      </form>
      <button
        type="button"
        disabled={occupe}
        onClick={() => {
          ecrireRepli(sessionId, true)
          setReplie(true)
        }}
        className="mt-1 min-h-[56px] w-full text-base font-semibold text-vert disabled:opacity-60"
      >
        Non merci
      </button>
      <p className="text-center text-xs leading-relaxed text-sourdine">
        {MENTION_90}
        <Confidentialite url={rapport.url_confidentialite} />
      </p>
    </section>
  )
}
