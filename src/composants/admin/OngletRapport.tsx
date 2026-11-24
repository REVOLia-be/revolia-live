import { useEffect, useState } from 'react'
import { messageErreur } from '../../lib/erreurs'
import {
  enregistrerParametres,
  lireConfigEnvoi,
  lireParametres,
  liensValides,
  nettoyerLiens,
  type EtatConfigEnvoi,
  type ParametresRapport,
} from '../../lib/rapport'
import Bouton from '../Bouton'
import Carte from '../Carte'
import ProchainesEtapes from '../rapport/ProchainesEtapes'
import EditeurLiens from './EditeurLiens'
import Interrupteur from './Interrupteur'

const CHAMP = 'w-full rounded-champ border-2 border-vert bg-blanc px-4 py-3 text-lg text-vertFonce placeholder:text-discret'

function texteEtat(v: boolean | null): string {
  return v === null ? 'inconnu' : v ? 'oui' : 'non'
}

// Onglet « Rapport & suivi » : réglages généraux (tout est désactivé par défaut).
export default function OngletRapport() {
  const [p, setP] = useState<ParametresRapport | null>(null)
  const [config, setConfig] = useState<EtatConfigEnvoi | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)

  useEffect(() => {
    let actif = true
    lireParametres()
      .then((r) => actif && setP(r))
      .catch((e) => actif && setErreur(messageErreur(e)))
    void lireConfigEnvoi().then((c) => actif && setConfig(c))
    return () => {
      actif = false
    }
  }, [])

  async function enregistrer() {
    if (!p) return
    setInfo(null)
    const probleme = liensValides(p.liens_suivi)
    if (probleme) {
      setErreur(probleme)
      return
    }
    const url = p.url_confidentialite?.trim()
    if (url && !/^https:\/\/\S+$/i.test(url)) {
      setErreur("L'adresse de la politique de confidentialité doit commencer par https://.")
      return
    }
    setOccupe(true)
    setErreur(null)
    try {
      const propre = { ...p, liens_suivi: nettoyerLiens(p.liens_suivi) }
      await enregistrerParametres(propre)
      setP(propre)
      setInfo('Réglages enregistrés.')
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setOccupe(false)
    }
  }

  if (!p) {
    return erreur ? (
      <p role="alert" className="text-lg font-semibold">{erreur}</p>
    ) : (
      <p className="text-lg">Un instant…</p>
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <Carte className="flex flex-col gap-3">
        <h2 className="text-2xl">Rapport par email</h2>
        <p className="text-base">
          Quand c'est activé, chaque participant peut recevoir par email le rapport de son quiz (ses réponses, les bonnes réponses, les « Pourquoi ? »).
          Tout est désactivé tant que tu ne l'as pas allumé.
        </p>
        <Interrupteur
          actif={p.rapport_actif}
          onChange={(v) => setP({ ...p, rapport_actif: v })}
          libelle="Rapport proposé aux participants"
          aide="Désactivé ici, le rapport n'est proposé dans aucun quiz, même si un quiz ou un formateur l'autorise."
        />
        <Interrupteur
          actif={p.newsletter_active}
          onChange={(v) => setP({ ...p, newsletter_active: v })}
          libelle="Invitation à la newsletter"
          aide="Ajoute, dans le rapport, un bouton pour recevoir les nouvelles de REVOLia. Ne fonctionne que si le rapport est proposé."
        />
      </Carte>

      <Carte className="flex flex-col gap-3">
        <h2 className="text-2xl">Politique de confidentialité</h2>
        <label className="flex flex-col gap-1 text-base font-semibold">
          Adresse de la page (commence par https://)
          <input
            className={CHAMP}
            inputMode="url"
            value={p.url_confidentialite ?? ''}
            onChange={(e) => setP({ ...p, url_confidentialite: e.target.value })}
            placeholder="https://revolia.be/confidentialite"
          />
        </label>
        <p className="text-base">Le lien « Confidentialité » apparaît sur le téléphone, dans le rapport et dans l'email. Laisse vide pour ne rien afficher.</p>
      </Carte>

      <Carte className="flex flex-col gap-4">
        <h2 className="text-2xl">Liens « Prochaines étapes » par défaut</h2>
        <p className="text-base">
          Ces liens apparaissent à la fin du rapport et de l'email, sauf pour un quiz qui a ses propres liens (de 0 à 5). Le premier est mis en avant.
        </p>
        <EditeurLiens liens={p.liens_suivi} onChange={(liens_suivi) => setP({ ...p, liens_suivi })} disabled={occupe} />
        <h3 className="text-xl">Aperçu tel que le participant le verra</h3>
        <ProchainesEtapes liens={nettoyerLiens(p.liens_suivi).filter((l) => l.titre || l.bouton)} apercu jetonNewsletter={p.newsletter_active ? 'apercu' : null} />
      </Carte>

      {erreur && (
        <p role="alert" className="text-lg font-semibold">
          {erreur}
        </p>
      )}
      {info && (
        <p role="status" className="text-lg font-semibold">
          {info}
        </p>
      )}
      <Bouton type="button" className="sm:w-auto" onClick={enregistrer} disabled={occupe}>
        {occupe ? 'Enregistrement…' : 'Enregistrer'}
      </Bouton>

      <Carte className="flex flex-col gap-2">
        <h2 className="text-2xl">État de la configuration</h2>
        <p className="text-lg">Envoi d'emails configuré : <strong>{config ? texteEtat(config.resend) : '…'}</strong></p>
        <p className="text-lg">Circle configuré : <strong>{config ? texteEtat(config.circle) : '…'}</strong></p>
        <p className="text-base text-discret">
          « Inconnu » veut dire que la vérification n'a pas pu se faire pour l'instant. On voit seulement si les clés existent côté serveur, jamais leur valeur.
          Sans envoi d'emails configuré, le participant reçoit un lien direct vers son rapport.
        </p>
      </Carte>
    </section>
  )
}
