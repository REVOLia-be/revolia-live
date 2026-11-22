import { useRef, useState } from 'react'
import Carte from '../Carte'
import Markdown from '../../lib/markdown'
import ContenuEtape from '../atelier/ContenuEtape'
import {
  ACCEPT_FICHIERS,
  LIMITES_ATELIER,
  envoyerFichier,
  formaterTaille,
  typeFichier,
} from '../../lib/atelier'
import {
  LIBELLE_ATELIER,
  LIMITES,
  nouvelleEtape,
  type ErreursQuestion,
  type EtapeEdition,
  type QuestionEdition,
} from './modele'

const CHAMP =
  'w-full rounded-champ border-2 border-vert bg-blanc px-4 py-3 text-lg text-vertFonce placeholder:text-discret'
const PETIT_BOUTON =
  'min-h-[44px] rounded-pilule border-2 border-vert bg-blanc px-4 text-base font-semibold text-vert transition-colors hover:bg-vert hover:text-blanc disabled:opacity-40 disabled:hover:bg-blanc disabled:hover:text-vert'
const BOUTON_FLECHE = PETIT_BOUTON.replace('px-4', 'w-11 px-0 text-xl')

function Message({ texte }: { texte?: string }) {
  if (!texte) return null
  return (
    <p role="alert" className="mt-1 text-base font-semibold">
      {texte}
    </p>
  )
}

interface Props {
  numero: number
  total: number
  question: QuestionEdition
  erreurs: ErreursQuestion
  afficherErreurs: boolean
  onChange: (q: QuestionEdition) => void
  onMonter: () => void
  onDescendre: () => void
  onDupliquer: () => void
  onSupprimer: () => void
  onReplier?: () => void
  formateurId: string
  majFonction: (f: (q: QuestionEdition) => QuestionEdition) => void
  signalerEnvoi: (delta: 1 | -1) => void
}

export default function EditeurAtelier({
  numero,
  total,
  question,
  erreurs,
  afficherErreurs,
  onChange,
  onMonter,
  onDescendre,
  onDupliquer,
  onSupprimer,
  onReplier,
  formateurId,
  majFonction,
  signalerEnvoi,
}: Props) {
  const err = afficherErreurs ? erreurs : {}
  const [ouverte, setOuverte] = useState<string | null>(question.etapes[0]?.id ?? null)
  const maj = (partiel: Partial<QuestionEdition>) => onChange({ ...question, ...partiel })

  const majEtape = (id: string, f: (e: EtapeEdition) => EtapeEdition) =>
    majFonction((q) => ({ ...q, etapes: q.etapes.map((e) => (e.id === id ? f(e) : e)) }))

  function deplacerEtape(i: number, delta: -1 | 1) {
    const j = i + delta
    if (j < 0 || j >= question.etapes.length) return
    const liste = [...question.etapes]
    ;[liste[i], liste[j]] = [liste[j], liste[i]]
    maj({ etapes: liste })
  }
  function ajouterEtape() {
    const e = nouvelleEtape()
    maj({ etapes: [...question.etapes, e] })
    setOuverte(e.id)
  }
  function retirerEtape(i: number) {
    const e = question.etapes[i]
    if ((e.titre.trim() || e.consigne.trim()) && !window.confirm(`Retirer l'étape ${i + 1} ?`)) return
    maj({ etapes: question.etapes.filter((_, j) => j !== i) })
  }

  return (
    <Carte className="flex flex-col gap-4 border-2 border-vertFonce">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xl">
          Atelier {numero} <span className="text-base font-normal">· {LIBELLE_ATELIER} · {question.etapes.length} étape{question.etapes.length > 1 ? 's' : ''}</span>
        </h3>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={PETIT_BOUTON} onClick={onMonter} disabled={numero === 1} aria-label={`Monter l'atelier ${numero}`}>
            ↑ Monter
          </button>
          <button type="button" className={PETIT_BOUTON} onClick={onDescendre} disabled={numero === total} aria-label={`Descendre l'atelier ${numero}`}>
            ↓ Descendre
          </button>
          <button type="button" className={PETIT_BOUTON} onClick={onDupliquer}>
            Dupliquer
          </button>
          <button type="button" className={PETIT_BOUTON} onClick={onSupprimer}>
            Supprimer
          </button>
          {onReplier && (
            <button type="button" className={PETIT_BOUTON} onClick={onReplier} aria-expanded="true">
              Replier
            </button>
          )}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-base font-semibold" htmlFor={`enonce-${question.id}`}>
          Titre de l'atelier
        </label>
        <input
          id={`enonce-${question.id}`}
          value={question.enonce}
          maxLength={LIMITES.enonce + 50}
          onChange={(e) => maj({ enonce: e.target.value })}
          className={CHAMP}
          placeholder="Par exemple : Répondre à un client mécontent"
        />
        <Message texte={err.enonce} />
      </div>

      <div>
        <label className="mb-1 block text-base font-semibold" htmlFor={`explication-${question.id}`}>
          Explication générale (facultatif)
        </label>
        <textarea
          id={`explication-${question.id}`}
          rows={2}
          maxLength={LIMITES.explication + 50}
          value={question.explication}
          onChange={(e) => maj({ explication: e.target.value })}
          className={CHAMP}
          placeholder="Une ou deux phrases pour présenter l'atelier"
        />
        <Message texte={err.explication} />
      </div>

      <div className="flex flex-col gap-3">
        <h4 className="text-lg font-semibold">Étapes</h4>
        <Message texte={err.etapes} />
        <ol className="flex flex-col gap-3">
          {question.etapes.map((e, i) => {
            const detail = err.detailEtapes?.[i]
            const depliee = ouverte === e.id || Boolean(detail)
            return (
              <li key={e.id} className="rounded-champ border-2 border-vertClair/70 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pilule border-2 border-vert text-base font-bold">
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    aria-expanded={depliee}
                    onClick={() => setOuverte(depliee && !detail ? null : e.id)}
                    className="min-h-[44px] min-w-0 flex-1 truncate text-left text-lg font-semibold"
                  >
                    <span className="sr-only">Étape {i + 1} : </span>
                    {e.titre.trim() || 'Étape sans titre'}
                    <span className="ml-2 text-sm font-normal text-discret">
                      {[e.fichiers.length > 0 && 'fichier', e.liens.length > 0 && 'lien', e.prompts.length > 0 && 'prompt', e.renduAttendu && 'rendu']
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" className={BOUTON_FLECHE} onClick={() => deplacerEtape(i, -1)} disabled={i === 0} aria-label={`Monter l'étape ${i + 1}`}>
                      <span aria-hidden>↑</span>
                    </button>
                    <button type="button" className={BOUTON_FLECHE} onClick={() => deplacerEtape(i, 1)} disabled={i === question.etapes.length - 1} aria-label={`Descendre l'étape ${i + 1}`}>
                      <span aria-hidden>↓</span>
                    </button>
                    <button type="button" className={PETIT_BOUTON} onClick={() => retirerEtape(i)} aria-label={`Retirer l'étape ${i + 1}`}>
                      Retirer
                    </button>
                  </div>
                </div>
                {depliee && (
                  <EditeurEtape
                    etape={e}
                    numero={i + 1}
                    erreurs={afficherErreurs ? detail : undefined}
                    majEtape={(f) => majEtape(e.id, f)}
                    formateurId={formateurId}
                    signalerEnvoi={signalerEnvoi}
                  />
                )}
              </li>
            )
          })}
        </ol>
        <div>
          <button type="button" className={PETIT_BOUTON} onClick={ajouterEtape}>
            + Ajouter une étape
          </button>
        </div>
      </div>
    </Carte>
  )
}

// --- Une étape --------------------------------------------------------------------------------

function EditeurEtape({
  etape,
  numero,
  erreurs,
  majEtape,
  formateurId,
  signalerEnvoi,
}: {
  etape: EtapeEdition
  numero: number
  erreurs?: { titre?: string; consigne?: string; liens?: string; prompts?: string }
  majEtape: (f: (e: EtapeEdition) => EtapeEdition) => void
  formateurId: string
  signalerEnvoi: (delta: 1 | -1) => void
}) {
  const id = etape.id
  const refConsigne = useRef<HTMLTextAreaElement>(null)
  const refFichier = useRef<HTMLInputElement>(null)
  const [envoi, setEnvoi] = useState(0)
  const [erreurFichier, setErreurFichier] = useState<string | null>(null)

  // Barre d'outils : entoure la sélection (gras, italique) ou préfixe les lignes (listes), puis remet le curseur.
  function appliquer(avant: string, apres: string, parLigne?: 'puce' | 'num') {
    const zone = refConsigne.current
    const texte = etape.consigne
    const d = zone?.selectionStart ?? texte.length
    const f = zone?.selectionEnd ?? texte.length
    const choisi = texte.slice(d, f)
    let nouveau: string
    let curseur: [number, number]
    if (parLigne) {
      const lignes = (choisi || 'élément').split('\n')
      const bloc = lignes.map((l, k) => (parLigne === 'puce' ? `- ${l}` : `${k + 1}. ${l}`)).join('\n')
      const sautAvant = d > 0 && texte[d - 1] !== '\n' ? '\n' : ''
      nouveau = texte.slice(0, d) + sautAvant + bloc + texte.slice(f)
      curseur = [d + sautAvant.length, d + sautAvant.length + bloc.length]
    } else {
      const milieu = choisi || 'texte'
      nouveau = texte.slice(0, d) + avant + milieu + apres + texte.slice(f)
      curseur = [d + avant.length, d + avant.length + milieu.length]
    }
    majEtape((e) => ({ ...e, consigne: nouveau }))
    window.requestAnimationFrame(() => {
      zone?.focus()
      zone?.setSelectionRange(curseur[0], curseur[1])
    })
  }

  async function ajouterFichiers(liste: FileList | null) {
    if (!liste || liste.length === 0) return
    setErreurFichier(null)
    for (const f of Array.from(liste)) {
      if (etape.fichiers.length >= LIMITES_ATELIER.fichiers) {
        setErreurFichier('Pas plus de 10 fichiers par étape.')
        break
      }
      signalerEnvoi(1)
      setEnvoi((n) => n + 1)
      try {
        const fichier = await envoyerFichier(f, formateurId)
        majEtape((e) => ({ ...e, fichiers: [...e.fichiers, fichier] }))
      } catch (e) {
        setErreurFichier(e instanceof Error ? e.message : "L'envoi du fichier a échoué.")
      } finally {
        signalerEnvoi(-1)
        setEnvoi((n) => n - 1)
      }
    }
    if (refFichier.current) refFichier.current.value = ''
  }

  return (
    <div className="mt-4 flex flex-col gap-5 border-t border-vertClair/60 pt-4">
      <div>
        <label className="mb-1 block text-base font-semibold" htmlFor={`titre-${id}`}>
          Titre de l'étape
        </label>
        <input
          id={`titre-${id}`}
          value={etape.titre}
          maxLength={LIMITES_ATELIER.titreEtape + 20}
          onChange={(e) => majEtape((x) => ({ ...x, titre: e.target.value }))}
          className={CHAMP}
          placeholder={numero === 1 ? 'Par exemple : Lis la situation' : "Titre de l'étape"}
        />
        {erreurs?.titre && <Message texte={erreurs.titre} />}
      </div>

      <div>
        <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
          <label className="text-base font-semibold" htmlFor={`consigne-${id}`}>
            Consigne
          </label>
          <span className="text-sm">Ce que l'apprenant lit en premier</span>
        </div>
        <div className="rounded-champ border-2 border-vert">
          <div className="flex flex-wrap gap-1 border-b border-vertClair/60 bg-blanc p-1" role="toolbar" aria-label="Mise en forme de la consigne">
            <button type="button" className={`${BOUTON_FLECHE} border-0 font-bold`} onClick={() => appliquer('**', '**')} aria-label="Gras">
              G
            </button>
            <button type="button" className={`${BOUTON_FLECHE} border-0 italic`} onClick={() => appliquer('*', '*')} aria-label="Italique">
              I
            </button>
            <button type="button" className={`${PETIT_BOUTON} border-0`} onClick={() => appliquer('', '', 'puce')} aria-label="Liste à puces">
              • Liste
            </button>
            <button type="button" className={`${PETIT_BOUTON} border-0`} onClick={() => appliquer('', '', 'num')} aria-label="Liste numérotée">
              1. Liste
            </button>
            <button
              type="button"
              className={`${PETIT_BOUTON} border-0`}
              onClick={() => {
                const zone = refConsigne.current
                const choisi = zone ? etape.consigne.slice(zone.selectionStart, zone.selectionEnd) : ''
                const url = window.prompt('Adresse du lien (elle doit commencer par https://)', 'https://')
                if (!url || !/^https:\/\/\S+$/i.test(url.trim())) return
                const d = zone?.selectionStart ?? etape.consigne.length
                const f = zone?.selectionEnd ?? etape.consigne.length
                const lien = `[${choisi || 'lien'}](${url.trim()})`
                majEtape((e) => ({ ...e, consigne: e.consigne.slice(0, d) + lien + e.consigne.slice(f) }))
              }}
              aria-label="Insérer un lien"
            >
              Lien
            </button>
          </div>
          <textarea
            id={`consigne-${id}`}
            ref={refConsigne}
            rows={5}
            value={etape.consigne}
            maxLength={LIMITES_ATELIER.consigne + 200}
            onChange={(e) => majEtape((x) => ({ ...x, consigne: e.target.value }))}
            className="block w-full rounded-b-champ bg-blanc px-4 py-3 text-lg text-vertFonce placeholder:text-discret"
            placeholder="Explique ce qu'il faut faire. Tu peux utiliser **gras**, des listes et des liens."
          />
        </div>
        <div className="flex justify-between gap-4">
          {erreurs?.consigne ? <Message texte={erreurs.consigne} /> : <span />}
          <span className="text-sm">
            {etape.consigne.trim().length}/{LIMITES_ATELIER.consigne}
          </span>
        </div>
        {etape.consigne.trim() && (
          <div className="mt-2 rounded-champ bg-doux p-4" aria-label="Aperçu de la consigne">
            <p className="mb-2 text-sm font-semibold">Aperçu</p>
            <Markdown texte={etape.consigne} className="text-base" />
          </div>
        )}
      </div>

      <section className="rounded-champ border-2 border-vertClair/70 p-4" aria-label="Matériel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h5 className="text-base font-semibold">Matériel</h5>
          <div className="flex flex-wrap gap-2">
            <input
              ref={refFichier}
              id={`fichier-${id}`}
              type="file"
              multiple
              accept={ACCEPT_FICHIERS}
              className="sr-only"
              onChange={(e) => void ajouterFichiers(e.target.files)}
              tabIndex={-1}
            />
            <button type="button" className={PETIT_BOUTON} onClick={() => refFichier.current?.click()} disabled={envoi > 0 || etape.fichiers.length >= LIMITES_ATELIER.fichiers}>
              {envoi > 0 ? 'Envoi…' : 'Ajouter un fichier'}
            </button>
            <button
              type="button"
              className={PETIT_BOUTON}
              disabled={etape.liens.length >= LIMITES_ATELIER.liens}
              onClick={() => majEtape((e) => ({ ...e, liens: [...e.liens, { url: 'https://', libelle: '' }] }))}
            >
              Ajouter un lien
            </button>
          </div>
        </div>
        <p className="mt-1 text-sm">Fichiers : PDF, Word, Excel, PowerPoint, images, texte ou CSV, 20 Mo maximum chacun.</p>
        {erreurFichier && (
          <p role="alert" className="mt-2 text-base font-semibold">
            {erreurFichier}
          </p>
        )}
        {etape.fichiers.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {etape.fichiers.map((f, k) => (
              <li key={f.chemin} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 text-base font-semibold [overflow-wrap:anywhere]">{f.nom}</span>
                <span className="flex items-center gap-3">
                  <span className="text-sm">
                    {typeFichier(f.nom)} · {formaterTaille(f.taille)}
                  </span>
                  <button
                    type="button"
                    className={PETIT_BOUTON}
                    aria-label={`Retirer le fichier ${f.nom}`}
                    onClick={() => majEtape((e) => ({ ...e, fichiers: e.fichiers.filter((_, j) => j !== k) }))}
                  >
                    Retirer
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {etape.liens.length > 0 && (
          <ul className="mt-3 flex flex-col gap-3">
            {etape.liens.map((l, k) => (
              <li key={k} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={l.libelle}
                  onChange={(e) => majEtape((x) => ({ ...x, liens: x.liens.map((y, j) => (j === k ? { ...y, libelle: e.target.value } : y)) }))}
                  className={CHAMP}
                  placeholder="Nom du lien"
                  aria-label={`Nom du lien ${k + 1}`}
                  maxLength={LIMITES_ATELIER.libelleLien + 20}
                />
                <input
                  value={l.url}
                  onChange={(e) => majEtape((x) => ({ ...x, liens: x.liens.map((y, j) => (j === k ? { ...y, url: e.target.value } : y)) }))}
                  className={CHAMP}
                  placeholder="https://…"
                  aria-label={`Adresse du lien ${k + 1}`}
                  inputMode="url"
                />
                <button
                  type="button"
                  className={PETIT_BOUTON}
                  aria-label={`Retirer le lien ${k + 1}`}
                  onClick={() => majEtape((e) => ({ ...e, liens: e.liens.filter((_, j) => j !== k) }))}
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        )}
        {erreurs?.liens && <Message texte={erreurs.liens} />}
      </section>

      <section className="rounded-champ border-2 border-vertClair/70 p-4" aria-label="Prompts prêts à copier">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h5 className="text-base font-semibold">Prompts prêts à copier</h5>
          <button
            type="button"
            className={PETIT_BOUTON}
            disabled={etape.prompts.length >= LIMITES_ATELIER.prompts}
            onClick={() => majEtape((e) => ({ ...e, prompts: [...e.prompts, { titre: '', texte: '' }] }))}
          >
            Ajouter un prompt
          </button>
        </div>
        {etape.prompts.length > 0 && (
          <ul className="mt-3 flex flex-col gap-4">
            {etape.prompts.map((p, k) => (
              <li key={k} className="flex flex-col gap-2">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={p.titre}
                    onChange={(e) => majEtape((x) => ({ ...x, prompts: x.prompts.map((y, j) => (j === k ? { ...y, titre: e.target.value } : y)) }))}
                    className={CHAMP}
                    placeholder="Titre du prompt"
                    aria-label={`Titre du prompt ${k + 1}`}
                    maxLength={LIMITES_ATELIER.titrePrompt + 20}
                  />
                  <button
                    type="button"
                    className={PETIT_BOUTON}
                    aria-label={`Retirer le prompt ${k + 1}`}
                    onClick={() => majEtape((e) => ({ ...e, prompts: e.prompts.filter((_, j) => j !== k) }))}
                  >
                    Retirer
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={p.texte}
                  onChange={(e) => majEtape((x) => ({ ...x, prompts: x.prompts.map((y, j) => (j === k ? { ...y, texte: e.target.value } : y)) }))}
                  className={CHAMP}
                  placeholder="Le texte que l'apprenant copiera dans son IA"
                  aria-label={`Texte du prompt ${k + 1}`}
                  maxLength={LIMITES_ATELIER.texteprompt + 200}
                />
                <p className="text-right text-sm">
                  {p.texte.trim().length}/{LIMITES_ATELIER.texteprompt}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm">Les boutons « Copier », « Ouvrir dans ChatGPT » et « Ouvrir dans Claude » sont ajoutés automatiquement.</p>
        {erreurs?.prompts && <Message texte={erreurs.prompts} />}
      </section>

      <fieldset className="rounded-champ border-2 border-vertClair/70 p-4">
        <legend className="px-1 text-base font-semibold">Rendu</legend>
        <label className="flex min-h-[44px] items-center gap-3 text-base">
          <input
            type="radio"
            name={`rendu-${id}`}
            checked={etape.renduAttendu}
            onChange={() => majEtape((e) => ({ ...e, renduAttendu: true }))}
            className="h-5 w-5 accent-vert"
          />
          L'apprenant dépose un rendu (zone « Colle ici ton résultat »)
        </label>
        <label className="flex min-h-[44px] items-center gap-3 text-base">
          <input
            type="radio"
            name={`rendu-${id}`}
            checked={!etape.renduAttendu}
            onChange={() => majEtape((e) => ({ ...e, renduAttendu: false }))}
            className="h-5 w-5 accent-vert"
          />
          Pas de rendu pour cette étape
        </label>
      </fieldset>
      <details className="rounded-champ border-2 border-vertClair/70 p-4">
        <summary className="min-h-[44px] cursor-pointer text-base font-semibold">Voir l'aperçu sur téléphone</summary>
        <div className="mx-auto mt-3 flex w-full max-w-[375px] flex-col gap-4 rounded-carte border-2 border-vert p-4">
          <p className="text-sm text-discret">
            Étape {numero} · aperçu simplifié
          </p>
          <h4 className="text-[26px] leading-tight [overflow-wrap:anywhere]">{etape.titre.trim() || 'Étape sans titre'}</h4>
          <ContenuEtape etape={etape} />
          {etape.renduAttendu && (
            <p className="rounded-champ border-2 border-vert p-3 text-base font-semibold">Colle ici ton résultat (zone de texte, bouton Enregistrer)</p>
          )}
        </div>
      </details>
    </div>
  )
}
