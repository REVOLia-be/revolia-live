// Panneau « Proposer des questions » : le formateur dépose un PDF (ou colle un texte),
// Claude propose des questions, le formateur choisit celles qu'il ajoute à l'éditeur.
// Rien n'est écrit en base ici : les questions ajoutées restent à relire puis à enregistrer.
import { useEffect, useRef, useState } from 'react'
import Bouton from '../Bouton'
import Carte from '../Carte'
import { messageErreur } from '../../lib/erreurs'
import { supabase } from '../../lib/supabase'
import { TYPES, type QuestionEdition, type TypeQuestion } from './modele'

type Niveau = 'decouverte' | 'intermediaire' | 'expert'

const NIVEAUX: { valeur: Niveau; libelle: string; explication: string }[] = [
  { valeur: 'decouverte', libelle: 'Découverte', explication: 'Notions clés et vocabulaire.' },
  { valeur: 'intermediaire', libelle: 'Intermédiaire', explication: 'Compréhension et application à des cas concrets.' },
  { valeur: 'expert', libelle: 'Expert', explication: 'Nuances, pièges fréquents, mises en situation.' },
]
const LIBELLE_NIVEAU: Record<Niveau, string> = {
  decouverte: 'Découverte',
  intermediaire: 'Intermédiaire',
  expert: 'Expert',
}

const TAILLE_MAX = 10 * 1024 * 1024 // 10 Mo
const TEXTE_MAX = 100_000

// Question telle que renvoyée par la fonction serveur.
interface Proposition {
  type: TypeQuestion
  niveau: Niveau
  enonce: string
  choix: string[] | null
  bonne_reponse: number | null
  bonnes_reponses?: number[] | null
  libelle_min: string | null
  libelle_max: string | null
  duree_secondes: number
  explication: string | null
}

interface Ligne {
  cle: string
  courante: Proposition
  precedente?: Proposition // version avant « Plus corsé », pour pouvoir annuler
  durcissement: boolean
  erreur?: string
  statut: 'a_traiter' | 'ajoutee' | 'ignoree'
}

const CHAMP =
  'w-full rounded-champ border-2 border-vert bg-blanc px-4 py-3 text-lg text-vertFonce placeholder:text-discret'

// Proposition du serveur -> question de l'éditeur (non enregistrée, nouvel identifiant).
function versEdition(p: Proposition): QuestionEdition {
  return {
    id: crypto.randomUUID(),
    type: p.type,
    enonce: p.enonce,
    choix: p.choix ?? [],
    bonne: p.type === 'qcm' ? p.bonne_reponse : null,
    bonnes: p.type === 'qcm_multiple' ? p.bonnes_reponses ?? [] : [],
    annoncerNombre: true,
    libelleMin: p.libelle_min ?? '',
    libelleMax: p.libelle_max ?? '',
    duree: p.duree_secondes,
    explication: p.explication ?? '',
    maxReponses: 1,
    image: null,
    imagesChoix: null,
    etapes: [],
  }
}

// Lit le fichier choisi et renvoie son contenu en base64 (sans le préfixe « data:… »).
function lireEnBase64(fichier: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader()
    lecteur.onload = () => resolve(String(lecteur.result).split(',')[1] ?? '')
    lecteur.onerror = () => reject(new Error('Lecture du fichier impossible.'))
    lecteur.readAsDataURL(fichier)
  })
}

// La fonction serveur renvoie { error: "phrase en français" } : on la récupère telle quelle.
async function messageDepuisFonction(erreur: unknown): Promise<string> {
  const contexte = (erreur as { context?: unknown } | null)?.context
  if (contexte instanceof Response) {
    try {
      const corps = await contexte.json()
      if (typeof corps?.error === 'string' && corps.error) return corps.error
    } catch {
      /* corps illisible : message générique ci-dessous */
    }
    return "Le service de proposition n'a pas répondu comme prévu. Réessaie dans un instant."
  }
  return messageErreur(erreur)
}

const niveauSuperieur = (n: Niveau): Niveau => (n === 'decouverte' ? 'intermediaire' : 'expert')

// Note la consommation de jetons pour le journal d'utilisation. Silencieux : un échec ne gêne jamais le formateur.
async function journaliser(usage: { input_tokens?: number; output_tokens?: number } | undefined) {
  if (!usage) return
  try {
    await supabase.rpc('journaliser_generation', {
      p_tokens_entree: usage.input_tokens,
      p_tokens_sortie: usage.output_tokens,
    })
  } catch {
    /* journalisation ratée : on ignore */
  }
}

interface Props {
  onAjouter: (questions: QuestionEdition[]) => void
  onFermer: () => void
}

export default function PanneauPropositions({ onAjouter, onFermer }: Props) {
  const [source, setSource] = useState<'pdf' | 'texte'>('pdf')
  const [fichier, setFichier] = useState<File | null>(null)
  const [texte, setTexte] = useState('')
  const [nombre, setNombre] = useState(8)
  const [types, setTypes] = useState<TypeQuestion[]>(['qcm', 'nuage', 'ouverte'])
  const [niveau, setNiveau] = useState<Niveau>('intermediaire')
  const [consignes, setConsignes] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [lignes, setLignes] = useState<Ligne[] | null>(null)
  const attente = useRef<HTMLParagraphElement>(null)

  // Le message d'attente prend la place du bouton : on s'assure qu'il est à l'écran.
  useEffect(() => {
    if (enCours) attente.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [enCours])

  function choisirFichier(f: File | null) {
    setErreur(null)
    if (f && f.size > TAILLE_MAX) {
      setFichier(null)
      setErreur('Ce PDF dépasse 10 Mo. Choisis un fichier plus léger ou un extrait du document.')
      return
    }
    setFichier(f)
  }

  function basculerType(t: TypeQuestion) {
    setTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t])
  }

  async function proposer() {
    setErreur(null)
    if (source === 'pdf' && !fichier) return setErreur("Choisis d'abord un fichier PDF.")
    if (source === 'texte' && !texte.trim()) return setErreur("Colle d'abord un texte.")
    if (types.length === 0) return setErreur('Coche au moins un type de question.')
    if (!Number.isInteger(nombre) || nombre < 3 || nombre > 20) return setErreur('Choisis un nombre de questions entre 3 et 20.')

    setEnCours(true)
    try {
      const contenu = source === 'pdf' ? { pdf_base64: await lireEnBase64(fichier as File), nom_fichier: fichier?.name } : { texte: texte.trim() }
      const { data, error } = await supabase.functions.invoke('generer-questions', {
        body: { ...contenu, nombre, types, niveau, consignes: consignes.trim() || undefined },
      })
      if (error) throw new Error(await messageDepuisFonction(error))
      void journaliser(data?.usage)
      const recues = (data?.questions ?? []) as Proposition[]
      if (recues.length === 0) throw new Error("Claude n'a rien proposé cette fois. Réessaie, ou précise tes consignes.")
      setLignes(recues.map((p) => ({ cle: crypto.randomUUID(), courante: p, durcissement: false, statut: 'a_traiter' })))
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  function modifierLigne(cle: string, partiel: Partial<Ligne>) {
    setLignes((ls) => (ls ? ls.map((l) => (l.cle === cle ? { ...l, ...partiel } : l)) : ls))
  }

  function ajouter(l: Ligne) {
    onAjouter([versEdition(l.courante)])
    modifierLigne(l.cle, { statut: 'ajoutee' })
  }

  function toutAjouter() {
    if (!lignes) return
    const restantes = lignes.filter((l) => l.statut === 'a_traiter')
    if (restantes.length === 0) return
    onAjouter(restantes.map((l) => versEdition(l.courante)))
    setLignes(lignes.map((l) => (l.statut === 'a_traiter' ? { ...l, statut: 'ajoutee' } : l)))
  }

  // « Plus corsé » : appel texte seul (sans le PDF), la version durcie remplace la proposition.
  async function durcir(l: Ligne) {
    modifierLigne(l.cle, { durcissement: true, erreur: undefined })
    try {
      const { data, error } = await supabase.functions.invoke('generer-questions', {
        body: { mode: 'durcir', question: l.courante, niveau_cible: niveauSuperieur(l.courante.niveau) },
      })
      if (error) throw new Error(await messageDepuisFonction(error))
      void journaliser(data?.usage)
      if (!data?.question) throw new Error("Claude n'a pas pu durcir cette question. Réessaie.")
      modifierLigne(l.cle, { courante: data.question as Proposition, precedente: l.courante, durcissement: false })
    } catch (e) {
      modifierLigne(l.cle, { durcissement: false, erreur: e instanceof Error && e.message ? e.message : messageErreur(e) })
    }
  }

  const restantes = lignes?.filter((l) => l.statut === 'a_traiter').length ?? 0

  return (
    <Carte className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-2xl">Proposer des questions</h2>
        <button type="button" onClick={onFermer} className="text-lg font-semibold text-vert underline">
          Fermer
        </button>
      </div>

      {/* Étape 1 : réglages */}
      {!lignes && (
        <>
          <div className="flex gap-2" role="tablist">
            {(['pdf', 'texte'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={source === s}
                disabled={enCours}
                onClick={() => setSource(s)}
                className={`min-h-[48px] rounded-pilule border-2 border-vert px-5 text-base font-semibold ${
                  source === s ? 'bg-vert text-blanc' : 'bg-blanc text-vert'
                }`}
              >
                {s === 'pdf' ? 'Un PDF' : 'Coller un texte'}
              </button>
            ))}
          </div>

          {source === 'pdf' ? (
            <div>
              <label className="mb-1 block text-base font-semibold" htmlFor="pdf-source">
                Ton document (PDF, 10 Mo maximum)
              </label>
              <input
                id="pdf-source"
                type="file"
                accept="application/pdf,.pdf"
                disabled={enCours}
                onChange={(e) => choisirFichier(e.target.files?.[0] ?? null)}
                className="block w-full text-base"
              />
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-base font-semibold" htmlFor="texte-source">
                Ton texte (guide d'étude, notes, résumé NotebookLM…)
              </label>
              <textarea
                id="texte-source"
                rows={8}
                value={texte}
                maxLength={TEXTE_MAX}
                disabled={enCours}
                onChange={(e) => setTexte(e.target.value)}
                className={CHAMP}
              />
              <p className="mt-1 text-base">
                {texte.length.toLocaleString('fr-FR')} / {TEXTE_MAX.toLocaleString('fr-FR')} caractères
              </p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-base font-semibold" htmlFor="nombre-propositions">
              Nombre de questions (3 à 20)
            </label>
            <input
              id="nombre-propositions"
              type="number"
              min={3}
              max={20}
              value={nombre}
              disabled={enCours}
              onChange={(e) => setNombre(Number(e.target.value))}
              className={`${CHAMP} sm:w-40`}
            />
          </div>

          <fieldset>
            <legend className="mb-1 text-base font-semibold">Types de questions</legend>
            <div className="flex flex-col gap-2">
              {TYPES.map((t) => (
                <label key={t.valeur} className="flex min-h-[44px] items-center gap-3 text-lg">
                  <input
                    type="checkbox"
                    className="h-6 w-6 accent-vert"
                    checked={types.includes(t.valeur)}
                    disabled={enCours}
                    onChange={() => basculerType(t.valeur)}
                  />
                  {t.libelle}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-base font-semibold">Niveau de difficulté</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {NIVEAUX.map((n) => (
                <button
                  key={n.valeur}
                  type="button"
                  aria-pressed={niveau === n.valeur}
                  disabled={enCours}
                  onClick={() => setNiveau(n.valeur)}
                  className={`flex flex-col gap-1 rounded-champ border-2 border-vert p-3 text-left ${
                    niveau === n.valeur ? 'bg-vert text-blanc' : 'bg-blanc text-vertFonce'
                  }`}
                >
                  <span className="text-lg font-semibold">{n.libelle}</span>
                  <span className="text-base">{n.explication}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label className="mb-1 block text-base font-semibold" htmlFor="consignes-propositions">
              Consignes (facultatif)
            </label>
            <textarea
              id="consignes-propositions"
              rows={2}
              value={consignes}
              maxLength={500}
              disabled={enCours}
              placeholder="ex. insister sur le chapitre 2"
              onChange={(e) => setConsignes(e.target.value)}
              className={CHAMP}
            />
          </div>

          {erreur && (
            <p role="alert" className="text-base font-semibold">
              {erreur}
            </p>
          )}
          {enCours ? (
            <p ref={attente} role="status" className="rounded-champ border-4 border-vert bg-blanc p-4 text-xl font-semibold">
              ⏳ Claude lit ton {source === 'pdf' ? 'document' : 'texte'}… Cela prend en général 30 à 60 secondes, ne ferme pas cette page.
            </p>
          ) : (
            <Bouton type="button" onClick={() => void proposer()}>
              ✨ Proposer des questions
            </Bouton>
          )}
        </>
      )}

      {/* Étape 2 : propositions */}
      {lignes && (
        <>
          <p className="text-lg">
            Claude te propose {lignes.length} question{lignes.length > 1 ? 's' : ''}. Ajoute celles que tu veux : tu pourras les relire et les modifier avant d'enregistrer.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Bouton type="button" onClick={toutAjouter} disabled={restantes === 0}>
              Tout ajouter ({restantes})
            </Bouton>
            <Bouton type="button" variante="secondaire" onClick={() => setLignes(null)}>
              Refaire une proposition
            </Bouton>
          </div>

          {lignes.map((l) => (
            <div key={l.cle} className={`flex flex-col gap-2 rounded-champ border-2 border-vertClair p-4 ${l.statut === 'ignoree' ? 'opacity-50' : ''}`}>
              <div className="flex flex-wrap items-center gap-2 text-base">
                <span className="rounded-pilule border border-vert px-3 py-0.5 font-semibold">
                  {TYPES.find((t) => t.valeur === l.courante.type)?.libelle}
                </span>
                <span className="rounded-pilule border border-vert px-3 py-0.5">{LIBELLE_NIVEAU[l.courante.niveau]}</span>
                <span>{l.courante.duree_secondes} s</span>
              </div>
              <p className="text-lg font-semibold">{l.courante.enonce}</p>
              {(l.courante.type === 'qcm' || l.courante.type === 'qcm_multiple') && (
                <ul className="list-inside list-disc text-lg">
                  {(l.courante.choix ?? []).map((c, i) => {
                    const bonne = l.courante.type === 'qcm' ? i === l.courante.bonne_reponse : (l.courante.bonnes_reponses ?? []).includes(i)
                    return (
                    <li key={i} className={bonne ? 'font-semibold underline' : ''}>
                      {c}
                      {bonne ? ' ✓' : ''}
                    </li>
                    )
                  })}
                </ul>
              )}
              {l.courante.explication && (
                <p className="rounded-champ border-2 border-l-8 border-vertFonce px-3 py-2 text-base">
                  <span className="font-semibold">Pourquoi ? </span>
                  {l.courante.explication}
                </p>
              )}
              {l.courante.type === 'echelle' && (l.courante.libelle_min || l.courante.libelle_max) && (
                <p className="text-base">
                  1 = {l.courante.libelle_min || '…'} · 5 = {l.courante.libelle_max || '…'}
                </p>
              )}
              {l.erreur && (
                <p role="alert" className="text-base font-semibold">
                  {l.erreur}
                </p>
              )}
              {l.durcissement && <p role="status" className="text-base font-semibold">Claude durcit cette question…</p>}

              {l.statut === 'a_traiter' && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Bouton type="button" className="sm:w-auto" disabled={l.durcissement} onClick={() => ajouter(l)}>
                    Ajouter
                  </Bouton>
                  <Bouton type="button" variante="secondaire" className="sm:w-auto" disabled={l.durcissement} onClick={() => void durcir(l)}>
                    Plus corsé
                  </Bouton>
                  {l.precedente && (
                    <Bouton
                      type="button"
                      variante="secondaire"
                      className="sm:w-auto"
                      disabled={l.durcissement}
                      onClick={() => modifierLigne(l.cle, { courante: l.precedente as Proposition, precedente: undefined, erreur: undefined })}
                    >
                      Annuler
                    </Bouton>
                  )}
                  <Bouton type="button" variante="secondaire" className="sm:w-auto" disabled={l.durcissement} onClick={() => modifierLigne(l.cle, { statut: 'ignoree' })}>
                    Ignorer
                  </Bouton>
                </div>
              )}
              {l.statut === 'ajoutee' && <p className="text-base font-semibold">✓ Ajoutée à ton quiz (pense à enregistrer).</p>}
              {l.statut === 'ignoree' && (
                <button type="button" className="self-start text-base font-semibold text-vert underline" onClick={() => modifierLigne(l.cle, { statut: 'a_traiter' })}>
                  Finalement, la remettre
                </button>
              )}
            </div>
          ))}
        </>
      )}
    </Carte>
  )
}
