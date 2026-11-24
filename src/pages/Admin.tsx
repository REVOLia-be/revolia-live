import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import Bouton from '../composants/Bouton'
import Carte from '../composants/Carte'
import CarteQuiz, { GrilleQuiz, resumerQuestions, type DonneesCarteQuiz } from '../composants/CarteQuiz'
import Interrupteur from '../composants/admin/Interrupteur'
import OngletRapport from '../composants/admin/OngletRapport'
import PanneauRapportQuiz from '../composants/admin/PanneauRapportQuiz'
import LogoMarque from '../composants/LogoMarque'
import MiseEnPageParticipant from '../composants/MiseEnPageParticipant'
import SelecteurVue, { usePreferenceVue } from '../composants/SelecteurVue'
import { appelerRpc } from '../lib/api'
import { useFormateur } from '../lib/auth'
import { messageErreur } from '../lib/erreurs'
import { autoriserRapportFormateur } from '../lib/rapport'
import { dupliquerQuiz } from '../lib/quiz'
import { supabase } from '../lib/supabase'
import { VueUtilisation, type LigneJournal } from './Utilisation'

interface FicheFormateur {
  id: string
  email: string
  est_admin: boolean
  actif: boolean
  nb_quiz: number
  derniere_session: string | null
  /** Absent tant que la migration du rapport n'est pas appliquée. */
  rapport_autorise?: boolean
}

interface LigneQuizAdmin extends DonneesCarteQuiz {
  formateur_id: string
  cree_le: string
}

type Onglet = 'quiz' | 'formateurs' | 'rapport' | 'utilisation'

const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: 'quiz', libelle: 'Tous les quiz' },
  { cle: 'formateurs', libelle: 'Formateurs' },
  { cle: 'rapport', libelle: 'Rapport & suivi' },
  { cle: 'utilisation', libelle: 'Utilisation globale' },
]

function dateCourte(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

const CHAMP = 'w-full rounded-champ border-2 border-vert bg-blanc px-4 py-3 text-lg text-vertFonce placeholder:text-discret'
const BOUTON_TEXTE = 'min-h-[56px] px-4 text-base font-semibold text-vertFonce underline disabled:opacity-60'

export default function Admin() {
  const formateur = useFormateur()

  if (formateur.statut === 'chargement') {
    return (
      <MiseEnPageParticipant>
        <p className="text-lg">Un instant…</p>
      </MiseEnPageParticipant>
    )
  }
  if (formateur.statut === 'deconnecte') return <Navigate to="/formateur/connexion" replace />
  if (formateur.statut === 'non_autorise') {
    return (
      <MiseEnPageParticipant>
        <h1 className="text-3xl">Accès refusé</h1>
        <p className="text-lg">Ce compte n'est pas encore autorisé comme formateur.</p>
        <p className="text-lg">Demande à JF de t'ajouter, puis reconnecte-toi.</p>
      </MiseEnPageParticipant>
    )
  }
  if (formateur.statut === 'erreur') {
    return (
      <MiseEnPageParticipant>
        <h1 className="text-3xl">Impossible de charger ton espace</h1>
        <p className="text-lg">{messageErreur(formateur.erreur)}</p>
        <Bouton type="button" onClick={() => window.location.reload()}>
          Réessayer
        </Bouton>
      </MiseEnPageParticipant>
    )
  }
  if (!formateur.est_admin) {
    return (
      <MiseEnPageParticipant>
        <h1 className="text-3xl">Administration</h1>
        <p className="text-lg">Cette page est réservée aux administrateurs.</p>
        <Link to="/formateur" className="text-lg font-semibold text-vert underline">
          ← Mes quiz
        </Link>
      </MiseEnPageParticipant>
    )
  }
  return <Administration moi={formateur.id} />
}

function Administration({ moi }: { moi: string }) {
  const [onglet, setOnglet] = useState<Onglet>('quiz')
  const [formateurs, setFormateurs] = useState<FicheFormateur[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const chargerFormateurs = useCallback(async () => {
    try {
      const lignes = await appelerRpc<FicheFormateur[]>('admin_liste_formateurs')
      setFormateurs((lignes ?? []).map((f) => ({ ...f, nb_quiz: Number(f.nb_quiz) })))
      setErreur(null)
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }, [])

  useEffect(() => {
    void chargerFormateurs()
  }, [chargerFormateurs])

  const auteurs = useMemo(() => new Map((formateurs ?? []).map((f) => [f.id, f.email])), [formateurs])

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <LogoMarque variante="vif" className="h-6 self-start" />
      <Link to="/formateur" className="self-start text-base font-semibold text-vert underline">
        ← Mes quiz
      </Link>
      <h1 className="text-4xl">Administration</h1>

      <div role="tablist" className="flex flex-wrap gap-2">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            type="button"
            role="tab"
            aria-selected={onglet === o.cle}
            onClick={() => setOnglet(o.cle)}
            className={`min-h-[56px] rounded-pilule border-2 border-vert px-6 text-lg font-semibold ${
              onglet === o.cle ? 'bg-vert text-blanc' : 'bg-blanc text-vert hover:bg-vert hover:text-blanc'
            }`}
          >
            {o.libelle}
          </button>
        ))}
      </div>

      {erreur && (
        <p role="alert" className="text-lg font-semibold">
          {erreur}
        </p>
      )}

      {onglet === 'quiz' && <OngletQuiz moi={moi} auteurs={auteurs} onChangeQuiz={chargerFormateurs} />}
      {onglet === 'formateurs' && (
        <OngletFormateurs moi={moi} formateurs={formateurs} recharger={chargerFormateurs} />
      )}
      {onglet === 'rapport' && <OngletRapport />}
      {onglet === 'utilisation' && <OngletUtilisation auteurs={auteurs} />}
    </main>
  )
}

// --- Tous les quiz ------------------------------------------------------------------------

function OngletQuiz({
  moi,
  auteurs,
  onChangeQuiz,
}: {
  moi: string
  auteurs: Map<string, string>
  onChangeQuiz: () => Promise<void>
}) {
  const navigate = useNavigate()
  const [quiz, setQuiz] = useState<LigneQuizAdmin[] | null>(null)
  const [recherche, setRecherche] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [occupe, setOccupe] = useState<string | null>(null)
  const [aSupprimer, setASupprimer] = useState<string | null>(null)
  const [panneauRapport, setPanneauRapport] = useState<string | null>(null)
  const [vue, setVue] = usePreferenceVue('revolia-live:vue-quiz:admin', 'liste')

  const charger = useCallback(async () => {
    const { data, error } = await supabase
      .from('quiz')
      .select('id, titre, description, code, formateur_id, modifie_le, cree_le, questions(type, image_question, ordre)')
      .order('modifie_le', { ascending: false, nullsFirst: false })
    if (error) {
      setErreur(messageErreur(error))
      return
    }
    setQuiz(
      (data ?? []).map(
        (q: {
          id: string
          titre: string
          description: string | null
          code?: string | null
          formateur_id: string
          modifie_le: string | null
          cree_le: string
          questions: { type: string; image_question: string | null; ordre: number }[]
        }) => ({
          id: q.id,
          titre: q.titre,
          description: q.description,
          code: q.code ?? null,
          formateur_id: q.formateur_id,
          modifie_le: q.modifie_le,
          cree_le: q.cree_le,
          ...resumerQuestions(q.questions),
        }),
      ),
    )
  }, [])

  useEffect(() => {
    void charger()
  }, [charger])

  const nomAuteur = (q: LigneQuizAdmin) => auteurs.get(q.formateur_id) ?? 'Formateur inconnu'

  const visibles = useMemo(() => {
    const t = recherche.trim().toLowerCase()
    if (!quiz) return []
    if (!t) return quiz
    return quiz.filter((q) => q.titre.toLowerCase().includes(t) || (auteurs.get(q.formateur_id) ?? '').toLowerCase().includes(t))
  }, [quiz, recherche, auteurs])

  async function dupliquer(q: LigneQuizAdmin) {
    setOccupe(q.id)
    setErreur(null)
    setInfo(null)
    try {
      await dupliquerQuiz(q.id, moi)
      setInfo(`« ${q.titre} » a été copié dans tes quiz.`)
      await charger()
      await onChangeQuiz()
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setOccupe(null)
    }
  }

  async function supprimer(q: LigneQuizAdmin) {
    setOccupe(q.id)
    setErreur(null)
    setInfo(null)
    const { error } = await supabase.from('quiz').delete().eq('id', q.id)
    if (error) setErreur(messageErreur(error))
    else {
      setInfo(`« ${q.titre} » a été supprimé.`)
      await charger()
      await onChangeQuiz()
    }
    setOccupe(null)
    setASupprimer(null)
  }

  return (
    <section className="flex flex-col gap-4">
      <SelecteurVue vue={vue} onChange={setVue} />
      <label className="flex flex-col gap-1 text-base font-semibold">
        Rechercher par titre ou par auteur
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Titre ou email"
          className={CHAMP}
        />
      </label>

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
      {quiz === null && !erreur && <p className="text-lg">Un instant…</p>}
      {quiz && visibles.length === 0 && (
        <Carte>
          <p className="text-lg">{quiz.length === 0 ? "Il n'y a aucun quiz pour l'instant." : 'Aucun quiz ne correspond à ta recherche.'}</p>
        </Carte>
      )}

      {vue === 'cartes' && panneauRapport && (
        <PanneauRapportQuiz
          quizId={panneauRapport}
          titre={quiz?.find((x) => x.id === panneauRapport)?.titre ?? ''}
          onFermer={() => setPanneauRapport(null)}
        />
      )}
      {vue === 'cartes' && visibles.length > 0 && (
        <GrilleQuiz>
          {visibles.map((q) => (
            <CarteQuiz
              key={q.id}
              quiz={{ ...q, modifie_le: q.modifie_le ?? q.cree_le }}
              auteur={`${nomAuteur(q)}${q.formateur_id === moi ? ' (toi)' : ''}`}
              action={{ libelle: 'Modifier', onChoisir: () => navigate(`/formateur/quiz/${q.id}`) }}
              menu={[
                { libelle: 'Rapport & liens', onChoisir: () => setPanneauRapport(q.id) },
                { libelle: 'Dupliquer dans mes quiz', onChoisir: () => void dupliquer(q) },
              ]}
              occupe={occupe === q.id}
              onSupprimer={() => supprimer(q)}
            />
          ))}
        </GrilleQuiz>
      )}

      {vue === 'liste' && visibles.map((q) => (
        <Carte key={q.id} className="flex flex-col gap-4">
          <div>
            <h2 className="text-2xl">{q.titre}</h2>
            <p className="text-base">
              Auteur : {nomAuteur(q)}
              {q.formateur_id === moi ? ' (toi)' : ''}
            </p>
            <p className="text-base">
              {q.nb_questions} question{q.nb_questions > 1 ? 's' : ''} · modifié le {dateCourte(q.modifie_le ?? q.cree_le)}
              {q.code && (
                <>
                  {' · '}Code <span data-testid="code-liste" className="font-bold tracking-widest">{q.code}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Bouton
              type="button"
              variante="secondaire"
              className="sm:w-auto"
              onClick={() => navigate(`/formateur/quiz/${q.id}`)}
              disabled={occupe === q.id}
            >
              Modifier
            </Bouton>
            <Bouton type="button" variante="secondaire" className="sm:w-auto" onClick={() => dupliquer(q)} disabled={occupe === q.id}>
              Dupliquer dans mes quiz
            </Bouton>
            <Bouton
              type="button"
              variante="secondaire"
              className="sm:w-auto"
              onClick={() => setPanneauRapport(panneauRapport === q.id ? null : q.id)}
              aria-expanded={panneauRapport === q.id}
            >
              Rapport & liens
            </Bouton>
            <button
              type="button"
              onClick={() => setASupprimer(q.id)}
              disabled={occupe === q.id}
              className={`${BOUTON_TEXTE} sm:ml-auto`}
            >
              Supprimer
            </button>
          </div>
          {panneauRapport === q.id && <PanneauRapportQuiz quizId={q.id} titre={q.titre} onFermer={() => setPanneauRapport(null)} />}
          {aSupprimer === q.id && (
            <div className="flex flex-col gap-3 rounded-champ border-2 border-vert p-4">
              <p className="text-lg font-semibold">
                Supprimer « {q.titre} », le quiz de {nomAuteur(q)}, et toutes ses questions ? Cette action est définitive.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Bouton type="button" className="sm:w-auto" onClick={() => supprimer(q)} disabled={occupe === q.id}>
                  Oui, supprimer
                </Bouton>
                <Bouton type="button" variante="secondaire" className="sm:w-auto" onClick={() => setASupprimer(null)} disabled={occupe === q.id}>
                  Non, garder
                </Bouton>
              </div>
            </div>
          )}
        </Carte>
      ))}
    </section>
  )
}

// --- Formateurs -----------------------------------------------------------------------------

type Action = { id: string; type: 'actif' | 'admin' }

function OngletFormateurs({
  moi,
  formateurs,
  recharger,
}: {
  moi: string
  formateurs: FicheFormateur[] | null
  recharger: () => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [ajout, setAjout] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [action, setAction] = useState<Action | null>(null)
  const [occupe, setOccupe] = useState(false)

  async function ajouter(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setAjout(true)
    setErreur(null)
    setInfo(null)
    try {
      await appelerRpc('admin_ajouter_formateur', { p_email: email.trim() })
      setInfo(`${email.trim()} est maintenant formateur.`)
      setEmail('')
      await recharger()
    } catch (err) {
      setErreur(messageErreur(err))
    } finally {
      setAjout(false)
    }
  }

  async function confirmer(f: FicheFormateur, a: Action) {
    setOccupe(true)
    setErreur(null)
    setInfo(null)
    try {
      await appelerRpc('admin_modifier_formateur', {
        p_formateur: f.id,
        p_actif: a.type === 'actif' ? !f.actif : f.actif,
        p_est_admin: a.type === 'admin' ? !f.est_admin : f.est_admin,
      })
      await recharger()
      setAction(null)
    } catch (err) {
      setErreur(messageErreur(err))
    } finally {
      setOccupe(false)
    }
  }

  async function changerRapport(f: FicheFormateur, autorise: boolean) {
    setOccupe(true)
    setErreur(null)
    setInfo(null)
    try {
      await autoriserRapportFormateur(f.id, autorise)
      await recharger()
    } catch (err) {
      setErreur(messageErreur(err))
    } finally {
      setOccupe(false)
    }
  }

  function phrase(f: FicheFormateur, a: Action): string {
    if (a.type === 'actif') {
      return f.actif
        ? `Désactiver ${f.email} ? Cette personne ne pourra plus créer ni lancer de quiz. Ses quiz sont conservés.`
        : `Réactiver ${f.email} ? Cette personne retrouvera l'accès à ses quiz.`
    }
    return f.est_admin
      ? `Retirer les droits d'administrateur à ${f.email} ?`
      : `Nommer ${f.email} administrateur ? Cette personne pourra voir, modifier et supprimer tous les quiz, et gérer les formateurs.`
  }

  return (
    <section className="flex flex-col gap-4">
      <Carte>
        <form onSubmit={ajouter} className="flex flex-col gap-3">
          <h2 className="text-2xl">Ajouter un formateur</h2>
          <p className="text-base">La personne doit s'être connectée une fois sur la page de connexion formateur.</p>
          <label className="flex flex-col gap-1 text-base font-semibold">
            Adresse email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom@exemple.be"
              className={CHAMP}
            />
          </label>
          <Bouton type="submit" className="sm:w-auto" disabled={ajout || !email.trim()}>
            {ajout ? 'Ajout…' : 'Ajouter'}
          </Bouton>
        </form>
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
      {formateurs === null && !erreur && <p className="text-lg">Un instant…</p>}

      {formateurs?.map((f) => {
        const soi = f.id === moi
        return (
          <Carte key={f.id} className="flex flex-col gap-3">
            <div>
              <h2 className="break-all text-xl">
                {f.email}
                {soi ? ' (toi)' : ''}
              </h2>
              <p className="text-base">
                Administrateur : {f.est_admin ? 'oui' : 'non'} · {f.actif ? 'Actif' : 'Désactivé'} · {f.nb_quiz} quiz · dernière
                session : {dateCourte(f.derniere_session)}
              </p>
            </div>
            {f.rapport_autorise !== undefined && (
              <Interrupteur
                actif={f.rapport_autorise}
                disabled={occupe}
                libelle="Rapport autorisé"
                aide="Désactivé, le rapport par email n'est proposé dans aucun quiz de cette personne."
                onChange={(v) => void changerRapport(f, v)}
              />
            )}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Bouton
                type="button"
                variante="secondaire"
                className="sm:w-auto"
                disabled={soi || occupe}
                title={soi ? 'Tu ne peux pas modifier tes propres droits.' : undefined}
                onClick={() => setAction({ id: f.id, type: 'actif' })}
              >
                {f.actif ? 'Désactiver' : 'Réactiver'}
              </Bouton>
              <Bouton
                type="button"
                variante="secondaire"
                className="sm:w-auto"
                disabled={soi || occupe}
                title={soi ? 'Tu ne peux pas modifier tes propres droits.' : undefined}
                onClick={() => setAction({ id: f.id, type: 'admin' })}
              >
                {f.est_admin ? "Retirer admin" : 'Nommer admin'}
              </Bouton>
            </div>
            {action?.id === f.id && (
              <div className="flex flex-col gap-3 rounded-champ border-2 border-vert p-4">
                <p className="text-lg font-semibold">{phrase(f, action)}</p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Bouton type="button" className="sm:w-auto" onClick={() => confirmer(f, action)} disabled={occupe}>
                    Oui, confirmer
                  </Bouton>
                  <Bouton type="button" variante="secondaire" className="sm:w-auto" onClick={() => setAction(null)} disabled={occupe}>
                    Annuler
                  </Bouton>
                </div>
              </div>
            )}
          </Carte>
        )
      })}
    </section>
  )
}

// --- Utilisation globale --------------------------------------------------------------------

function OngletUtilisation({ auteurs }: { auteurs: Map<string, string> }) {
  const [lignes, setLignes] = useState<LigneJournal[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    let actif = true
    void (async () => {
      const { data, error } = await supabase.from('journal_usage').select('*').order('cree_le', { ascending: false })
      if (!actif) return
      if (error) setErreur(messageErreur(error))
      else setLignes((data ?? []) as LigneJournal[])
    })()
    return () => {
      actif = false
    }
  }, [])

  return (
    <section className="flex flex-col gap-6">
      {erreur && (
        <p role="alert" className="text-lg font-semibold">
          {erreur}
        </p>
      )}
      {lignes === null && !erreur && <p className="text-lg">Un instant…</p>}
      {lignes && <VueUtilisation lignes={lignes} auteurs={auteurs} />}
    </section>
  )
}
