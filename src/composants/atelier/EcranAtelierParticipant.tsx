import { useEffect, useRef, useState } from 'react'
import ContenuEtape from './ContenuEtape'
import LogoMarque from '../LogoMarque'
import Markdown from '../../lib/markdown'
import { Aide, Coche, Fleche, FlecheGauche } from '../Pictos'
import { appelerRpc } from '../../lib/api'
import { LIMITES_ATELIER } from '../../lib/atelier'
import { messageErreur } from '../../lib/erreurs'
import type { EtatSession } from '../../lib/session'

const BOUTON_PRINCIPAL =
  'flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-pilule bg-vert px-6 text-lg font-semibold text-blanc transition-colors hover:bg-vertFonce disabled:bg-inactif'
const BOUTON_ROND =
  'flex h-14 w-14 shrink-0 items-center justify-center rounded-pilule border-2 border-vert bg-blanc text-vert transition-colors hover:bg-vert hover:text-blanc disabled:border-discret disabled:text-inactif disabled:hover:bg-blanc disabled:hover:text-inactif'

// Écran du téléphone pendant un atelier : chacun avance à son rythme. Le serveur garde la progression :
// après un rechargement, on reprend exactement là où on s'était arrêté (ma_progression).
export default function EcranAtelierParticipant({
  etat,
  recharger,
  connexionPerdue,
}: {
  etat: EtatSession
  recharger: () => void
  connexionPerdue: boolean
}) {
  const question = etat.question!
  const etapes = question.etapes ?? []
  const n = etapes.length
  const prog = etat.ma_progression ?? null
  const debut = prog ? (prog.termine ? n + 1 : Math.min(Math.max(prog.etape, 1), n + 1)) : 1

  const [etape, setEtape] = useState(debut) // 1..n, n + 1 = terminé (valeur confirmée par le serveur)
  const [revue, setRevue] = useState<number | null>(null) // relecture après la fin (sans toucher à la progression)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [bloque, setBloque] = useState(prog?.bloque ?? false)
  const defilement = useRef<HTMLDivElement>(null)

  // Rendus : brouillon local (zone de texte) et dernier texte enregistré (pour l'indicateur).
  const [brouillons, setBrouillons] = useState<Record<string, string>>(() => ({ ...(etat.mes_rendus ?? {}) }))
  const [enregistres, setEnregistres] = useState<Record<string, string>>(() => ({ ...(etat.mes_rendus ?? {}) }))
  const [rendusEnCours, setRendusEnCours] = useState<string | null>(null)
  const [erreurRendu, setErreurRendu] = useState<string | null>(null)

  // Le serveur est la référence pour « bloqué » (le formateur peut le résoudre depuis sa vue).
  const bloqueServeur = prog?.bloque
  useEffect(() => {
    if (bloqueServeur !== undefined) setBloque(bloqueServeur)
  }, [bloqueServeur])

  // Première arrivée : la ligne de progression n'existe pas encore, on la crée (étape 1).
  useEffect(() => {
    if (!prog && n > 0) {
      void appelerRpc('atelier_aller_a', { p_question: question.id, p_etape: 1 }).then(recharger, () => undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function remonter() {
    defilement.current?.scrollTo({ top: 0 })
  }

  async function aller(cible: number) {
    if (envoi) return
    if (revue !== null) {
      // Relecture : purement locale.
      setRevue(cible > n || cible < 1 ? null : cible)
      remonter()
      return
    }
    setEnvoi(true)
    setErreur(null)
    try {
      await appelerRpc('atelier_aller_a', { p_question: question.id, p_etape: cible })
      setEtape(cible)
      remonter()
      recharger()
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setEnvoi(false)
    }
  }

  async function basculerBloque(valeur: boolean) {
    if (envoi) return
    setEnvoi(true)
    setErreur(null)
    try {
      await appelerRpc('atelier_bloque', { p_question: question.id, p_bloque: valeur })
      setBloque(valeur)
      if (valeur) remonter() // le bandeau « Le formateur est prévenu » est en haut : on l'amène à l'écran
      recharger()
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setEnvoi(false)
    }
  }

  async function enregistrerRendu(etapeId: string) {
    const texte = (brouillons[etapeId] ?? '').trim()
    if (!texte || rendusEnCours) return
    setRendusEnCours(etapeId)
    setErreurRendu(null)
    try {
      await appelerRpc('atelier_rendre', { p_etape: etapeId, p_texte: texte })
      setEnregistres((e) => ({ ...e, [etapeId]: texte }))
      setBrouillons((b) => ({ ...b, [etapeId]: texte }))
    } catch (e) {
      setErreurRendu(messageErreur(e))
    } finally {
      setRendusEnCours(null)
    }
  }

  const entete = (
    <div className="mx-auto w-full max-w-md px-4 pt-4">
      <LogoMarque variante="vif" className="h-6" />
      {etat.moi?.pseudo && <span className="sr-only">Connecté en tant que {etat.moi.pseudo}</span>}
    </div>
  )

  if (n === 0) {
    return (
      <div className="flex min-h-dvh flex-col bg-blanc text-vertFonce">
        {entete}
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-8">
          <h1 className="text-3xl [overflow-wrap:anywhere]">{question.enonce}</h1>
          <p className="text-lg">Cet atelier n'a pas encore d'étape. Regarde l'écran, le formateur va te guider.</p>
        </main>
      </div>
    )
  }

  const termine = etape > n && revue === null
  const indice = revue !== null ? revue : Math.min(etape, n) // numéro (1..n) de l'étape affichée
  const courante = etapes[indice - 1]
  const enRevue = revue !== null
  const enRoute = bloque && (prog?.en_route ?? false)

  const segments = (
    <div
      role="progressbar"
      aria-label={termine ? 'Atelier terminé' : `Étape ${indice} sur ${n}`}
      aria-valuemin={1}
      aria-valuemax={n}
      aria-valuenow={termine ? n : indice}
      className="mt-2.5 flex gap-1"
    >
      {etapes.map((_, i) => (
        <i key={i} className={`h-1.5 flex-1 rounded-pilule border-[1.5px] border-vert ${termine || i < indice ? 'bg-vert' : 'bg-blanc'}`} />
      ))}
    </div>
  )

  const banniereReseau = connexionPerdue && (
    <p role="status" className="rounded-champ border-2 border-vert bg-blanc px-4 py-3 text-base font-semibold leading-snug">
      Connexion perdue. Ce que tu as déjà fait est gardé. On réessaie tout seul.
    </p>
  )

  // --- Fin d'atelier ---------------------------------------------------------------------------
  if (termine) {
    return (
      <div className="flex h-dvh flex-col bg-blanc text-vertFonce">
        {entete}
        <div className="mx-auto w-full max-w-md px-4 pt-3">
          <p className="truncate text-sm text-discret">Atelier · {question.enonce}</p>
          <p className="text-lg font-bold">Atelier terminé</p>
          {segments}
        </div>
        <div ref={defilement} className="mx-auto mt-3 w-full max-w-md flex-1 overflow-y-auto border-t border-vertClair/60 px-4 py-5">
          <div className="flex flex-col gap-5">
            {banniereReseau}
            <span className="flex h-20 w-20 items-center justify-center rounded-pilule bg-vert text-blanc">
              <Coche taille={44} trace />
            </span>
            <h1 className="text-[32px] leading-tight">Tu as terminé l'atelier, bravo !</h1>
            <p className="text-lg">Attends la suite en regardant l'écran.</p>
            <ul className="flex flex-col" aria-label="Les étapes faites">
              {etapes.map((e) => (
                <li key={e.id} className="flex items-center gap-3 border-b border-vertClair/50 py-3 last:border-b-0">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-pilule bg-vert text-blanc">
                    <Coche taille={16} />
                  </span>
                  <span className="text-base">{e.titre}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mx-auto w-full max-w-md border-t border-vertClair/60 px-4 py-3">
          <button
            type="button"
            onClick={() => {
              setRevue(1)
              remonter()
            }}
            className="min-h-[56px] w-full rounded-pilule border-2 border-vert bg-blanc px-6 text-lg font-semibold text-vert transition-colors hover:bg-vert hover:text-blanc"
          >
            Revoir mes étapes
          </button>
        </div>
      </div>
    )
  }

  // --- Étape en cours --------------------------------------------------------------------------
  const rendu = courante.rendu_attendu
  const texte = brouillons[courante.id] ?? ''
  const dejaEnregistre = (enregistres[courante.id] ?? '') === texte.trim() && texte.trim() !== ''
  const derniere = indice === n
  const consigneGenerale = (question.explication ?? '').trim()

  return (
    <div className="flex h-dvh flex-col bg-blanc text-vertFonce">
      {entete}
      <header className="mx-auto w-full max-w-md px-4 pt-3">
        <p className="truncate text-sm text-discret">Atelier · {question.enonce}</p>
        <p className="text-lg font-bold">
          Étape {indice} sur {n}
          {enRevue && <span className="ml-2 text-sm font-normal text-discret">(relecture)</span>}
        </p>
        {segments}
      </header>

      <div ref={defilement} className="mx-auto mt-3 w-full max-w-md flex-1 overflow-y-auto border-t border-vertClair/60 px-4 py-5">
        <div className="flex flex-col gap-5">
          {banniereReseau}
          {bloque && !enRevue && (
            <section role="status" className="flex flex-col gap-3 rounded-carte bg-vertFonce p-4 text-blanc">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pilule bg-blanc text-vertFonce">
                  <Coche taille={20} />
                </span>
                <p className="font-texte text-lg font-bold leading-snug">{enRoute ? 'Le formateur arrive.' : 'Le formateur est prévenu, il arrive.'}</p>
              </div>
              <p className="text-sm leading-snug">Tu peux continuer à lire l'étape en attendant. Pas de panique : tout le monde est déjà passé par là.</p>
              <button
                type="button"
                disabled={envoi}
                onClick={() => void basculerBloque(false)}
                className="min-h-[56px] w-full rounded-pilule bg-blanc px-6 text-lg font-semibold text-vertFonce disabled:opacity-60"
              >
                Annuler, ça va mieux
              </button>
            </section>
          )}
          {erreur && (
            <p role="alert" className="rounded-champ border-2 border-vert bg-blanc px-4 py-3 text-base font-semibold leading-snug">
              {erreur}
            </p>
          )}

          {indice === 1 && consigneGenerale && <Markdown texte={consigneGenerale} className="text-base text-discret" />}
          <h1 className="text-[28px] leading-tight [overflow-wrap:anywhere]">{courante.titre}</h1>
          <ContenuEtape etape={courante} />

          {rendu && (
            <section className="flex flex-col gap-2" aria-label="Ton rendu">
              <label htmlFor={`rendu-${courante.id}`} className="font-texte text-base font-bold">
                Colle ici ton résultat
              </label>
              <textarea
                id={`rendu-${courante.id}`}
                rows={8}
                value={texte}
                maxLength={LIMITES_ATELIER.rendu}
                onChange={(e) => setBrouillons((b) => ({ ...b, [courante.id]: e.target.value }))}
                className="w-full rounded-champ border-2 border-vert bg-blanc px-4 py-3 text-lg text-vertFonce placeholder:text-discret"
                placeholder="Colle ou écris ton résultat ici"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-discret">
                  {texte.length}/{LIMITES_ATELIER.rendu}
                </span>
                <span role="status" className="flex items-center gap-1 text-sm font-bold">
                  {dejaEnregistre ? (
                    <>
                      <Coche taille={16} />
                      Enregistré
                    </>
                  ) : texte.trim() ? (
                    'Pas encore enregistré'
                  ) : (
                    'Facultatif'
                  )}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void enregistrerRendu(courante.id)}
                disabled={!texte.trim() || dejaEnregistre || rendusEnCours !== null}
                className="min-h-[56px] w-full rounded-pilule border-2 border-vert bg-blanc px-6 text-lg font-semibold text-vert transition-colors hover:bg-vert hover:text-blanc disabled:border-discret disabled:text-inactif disabled:hover:bg-blanc disabled:hover:text-inactif"
              >
                {rendusEnCours === courante.id ? 'Enregistrement…' : 'Enregistrer mon rendu'}
              </button>
              {erreurRendu && (
                <p role="alert" className="text-base font-semibold">
                  {erreurRendu}
                </p>
              )}
              <p className="rounded-champ bg-doux p-3 text-sm leading-snug">Le formateur peut lire ce que tu colles ici. Il ne l'affichera jamais avec ton pseudo.</p>
            </section>
          )}

          {(courante.prompts.length > 0 || rendu) && (
            <p className="text-sm text-discret">Ne colle pas de données réelles de clients : invente ou anonymise.</p>
          )}
        </div>
      </div>

      <footer className="mx-auto w-full max-w-md border-t border-vertClair/60 px-4 pb-4 pt-2">
        {!bloque && !enRevue && (
          <button
            type="button"
            disabled={envoi}
            onClick={() => void basculerBloque(true)}
            className="mx-auto mb-1 flex min-h-[56px] items-center justify-center gap-2 px-4 text-base font-semibold underline"
          >
            <Aide taille={20} />
            Je suis bloqué
          </button>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            className={BOUTON_ROND}
            disabled={indice <= 1 || envoi}
            onClick={() => void aller(indice - 1)}
            aria-label="Étape précédente"
          >
            <FlecheGauche taille={22} />
          </button>
          <button type="button" className={BOUTON_PRINCIPAL} disabled={envoi} onClick={() => void aller(indice + 1)}>
            {enRevue ? (derniere ? 'Retour à la fin' : 'Étape suivante') : derniere ? "Terminer l'atelier" : 'Étape suivante'}
            <Fleche taille={20} />
          </button>
        </div>
      </footer>
    </div>
  )
}
