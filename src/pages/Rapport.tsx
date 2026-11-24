import { useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import LogoMarque from '../composants/LogoMarque'
import Photo from '../composants/Photo'
import { Ampoule } from '../composants/Pictos'
import ProchainesEtapes from '../composants/rapport/ProchainesEtapes'
import { messageErreur } from '../lib/erreurs'
import { formaterDate, lireRapportParJeton, type QuestionRapport, type RapportComplet } from '../lib/rapport'

// Page publique du rapport : accessible sans connexion, grâce au jeton secret du lien. Imprimable (« Enregistrer en PDF »).

const TYPES: Record<string, string> = {
  qcm: 'QCM · une seule réponse',
  qcm_multiple: 'QCM · plusieurs réponses',
  nuage: 'Nuage de mots · pas de bonne réponse',
  echelle: 'Échelle · pas de bonne réponse',
  ouverte: 'Question ouverte · pas de bonne réponse',
  atelier: 'Atelier · à ton rythme',
}

const estQcm = (q: QuestionRapport) => q.type === 'qcm' || q.type === 'qcm_multiple'

function indices(q: QuestionRapport): number[] {
  return (q.mes_reponses ?? []).map((v) => Number(v)).filter((n) => Number.isInteger(n))
}

function aRepondu(q: QuestionRapport): boolean {
  if (q.type === 'atelier') return (q.etapes ?? []).some((e) => e.mon_rendu?.trim())
  return (q.mes_reponses ?? []).length > 0
}

function qcmJuste(q: QuestionRapport): boolean | null {
  if (!estQcm(q) || !q.bonnes_reponses) return null
  const mes = new Set(indices(q))
  return mes.size === q.bonnes_reponses.length && q.bonnes_reponses.every((b) => mes.has(b))
}

export default function Rapport() {
  const { jeton } = useParams()
  const [rapport, setRapport] = useState<RapportComplet | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    if (!jeton) return
    let actif = true
    lireRapportParJeton(jeton)
      .then((r) => actif && setRapport(r))
      .catch((e) => actif && setErreur(messageErreur(e)))
    return () => {
      actif = false
    }
  }, [jeton])

  useEffect(() => {
    if (rapport) document.title = `Mon rapport – ${rapport.quiz_titre} – REVOLia`
  }, [rapport])

  if (erreur) {
    return (
      <div className="flex min-h-dvh flex-col bg-blanc text-bleuViolet">
        <header className="px-6 py-6">
          <LogoMarque variante="vif" className="h-8" />
        </header>
        <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-5 py-10">
          <h1 className="text-4xl text-bleuViolet">Ce rapport n'est pas disponible</h1>
          <p role="alert" className="text-lg">{erreur}</p>
          <p className="text-lg">Si tu penses que c'est une erreur, ouvre à nouveau le lien reçu par email.</p>
        </main>
      </div>
    )
  }
  if (!rapport) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-fond text-bleuViolet">
        <p className="text-lg">Un instant…</p>
      </div>
    )
  }
  return <Document rapport={rapport} />
}

function Document({ rapport }: { rapport: RapportComplet }) {
  const questions = rapport.questions ?? []
  const { jour, date } = formaterDate(rapport.date)
  const nbReponses = questions.filter(aRepondu).length
  const qcm = questions.filter((q) => estQcm(q) && q.bonnes_reponses)
  const qcmJustes = qcm.filter((q) => qcmJuste(q)).length
  const toutRepondu = questions.length > 0 && nbReponses === questions.length
  const prenom = rapport.pseudo ?? ''
  const stats = [
    { valeur: String(questions.length), libelle: 'questions explorées ensemble' },
    ...(qcm.length > 0 ? [{ valeur: `${qcmJustes}/${qcm.length}`, libelle: 'bonnes réponses aux QCM' }] : []),
    { valeur: `${nbReponses}/${questions.length}`, libelle: 'questions auxquelles tu as répondu' },
  ]

  return (
    <div className="rapport min-h-dvh bg-fond text-bleuViolet print:bg-blanc">
      <header className="rapport-icone-haut relative overflow-hidden bg-bleuViolet px-[22px] pb-[72px] pt-7 text-blanc md:px-14 md:pb-[110px] md:pt-10 print:min-h-[128mm] print:rounded-[14px] print:px-[34px] print:pb-[90px] print:pt-[34px]">
        <div className="relative z-10 mx-auto max-w-[880px]">
          <LogoMarque variante="clair" className="h-9 md:h-11" />
          <p className="mt-16 text-xs font-semibold uppercase tracking-[0.16em] text-vertClair md:mt-24 print:mt-[150px]">
            Rapport de quiz{prenom && ` · pour ${prenom}`}
          </p>
          <h1 className="mb-2 mt-3.5 text-[40px] leading-[1.12] [overflow-wrap:anywhere] md:text-[64px] print:text-[46px]">{rapport.quiz_titre}</h1>
          <p className="mt-[18px] flex flex-wrap gap-x-[22px] gap-y-1.5 text-[15px] text-blancDoux md:text-base">
            {date && (
              <span>
                {jour} <b className="font-semibold text-blanc">{date}</b>
              </span>
            )}
            {rapport.formateur_nom && (
              <span>
                Animé par <b className="font-semibold text-blanc">{rapport.formateur_nom}</b>, REVOLia
              </span>
            )}
          </p>
          <p className="mt-[34px] inline-block rounded-pilule border border-voileTrait px-[18px] py-2 text-sm print:mt-[50px]">
            {toutRepondu ? (
              <>
                Bravo{prenom && ` ${prenom}`} : <b className="font-semibold text-vertClair">tu as répondu à toutes les questions</b>
              </>
            ) : (
              <>
                Merci d'avoir joué le jeu{prenom && `, ${prenom}`}
              </>
            )}
          </p>
        </div>
      </header>

      <main className="px-4 pb-10 md:px-10 md:pb-[60px] print:px-0 print:pb-0">
        <div
          className={`relative z-20 mx-auto -mt-11 mb-9 grid max-w-[880px] gap-2.5 md:-mt-16 md:gap-[18px] print:mx-3.5 print:-mt-[34px] print:mb-[22px] ${stats.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
        >
          {stats.map((s) => (
            <div key={s.libelle} className="rounded-[16px] bg-blanc px-3.5 py-4 shadow-lg md:px-[26px] md:py-6 print:border print:border-trait print:px-3.5 print:py-3 print:shadow-none">
              <b className="block font-titre text-[34px] font-normal leading-[1.1] text-vert md:text-5xl print:text-[30px]">{s.valeur}</b>
              <span className="mt-1 block text-xs leading-snug text-vertFonce md:text-sm">{s.libelle}</span>
            </div>
          ))}
        </div>

        <p className="mx-auto mb-[22px] max-w-[880px] text-[15px] text-sourdine print:break-after-page">
          Voici, question après question, ce que tu as répondu, la bonne réponse quand il y en a une, et le « Pourquoi ? » pour retenir l'essentiel. Prends ton temps.
        </p>

        {questions.map((q, i) => (
          <CarteQuestion key={`${q.ordre}-${i}`} q={q} numero={i + 1} />
        ))}

        <ProchainesEtapes
          liens={rapport.liens_suivi ?? []}
          jetonNewsletter={rapport.newsletter_proposee && !rapport.newsletter_confirmee ? rapport.jeton_newsletter : null}
          newsletterConfirmee={rapport.newsletter_proposee && rapport.newsletter_confirmee}
        />

        <div className="mx-auto mt-7 flex max-w-[880px] flex-wrap items-center justify-between gap-3 text-sm text-sourdine print:hidden">
          <span>Envie de le garder ? Enregistre ce rapport en PDF.</span>
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-[56px] rounded-pilule border-2 border-vert bg-blanc px-6 text-base font-semibold text-vert hover:bg-vert hover:text-blanc"
          >
            Enregistrer en PDF / Imprimer
          </button>
        </div>
      </main>

      <footer className="border-t border-trait bg-blanc px-[22px] py-7 text-[13px] text-sourdine print:border-0 print:px-0 print:pb-0 print:pt-3.5 print:text-[9pt]">
        <div className="mx-auto flex max-w-[880px] flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <LogoMarque variante="vif" className="h-7" />
          <span>
            Ce rapport est personnel : il ne contient que tes réponses. Il reste disponible 90 jours.
            {rapport.url_confidentialite && (
              <>
                {' '}
                <a href={rapport.url_confidentialite} className="text-vert underline">Confidentialité</a>
              </>
            )}
            {' · '}
            <a href="https://revolia.be" className="text-vert underline">revolia.be</a>
          </span>
        </div>
      </footer>
    </div>
  )
}

function CarteQuestion({ q, numero }: { q: QuestionRapport; numero: number }) {
  const photo = q.image_url
  const etiquette = `${TYPES[q.type] ?? ''}${photo ? ' · avec photo' : ''}`
  return (
    <section className="mx-auto mb-5 max-w-[880px] break-inside-avoid rounded-[20px] border border-trait bg-blanc px-5 py-6 md:px-10 md:py-9 print:mb-3 print:rounded-[14px] print:px-[22px] print:py-5">
      <div className="flex items-start gap-3.5 md:gap-5">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-pilule bg-vert text-base font-bold text-blanc md:h-12 md:w-12 md:text-[19px]" aria-hidden>
          {numero}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-vert">{etiquette}</p>
          {q.enonce && <h2 className="mt-0.5 text-[22px] leading-tight [overflow-wrap:anywhere] md:text-[28px] print:text-[17pt]">{q.enonce}</h2>}
        </div>
      </div>
      {photo && <PhotoRapport chemin={photo} alt={q.enonce || `Photo de la question ${numero}`} />}
      <ReponsesQuestion q={q} />
      {q.explication?.trim() && (
        <div className="mt-4 flex gap-3 rounded-[14px] bg-fond px-4 py-3.5 text-sm leading-relaxed">
          <Ampoule taille={22} className="mt-0.5 text-vert" />
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <b className="mb-0.5 block text-[13px] tracking-wide text-vertFonce">Pourquoi ?</b>
            {q.explication}
          </div>
        </div>
      )}
    </section>
  )
}

function PhotoRapport({ chemin, alt, className = '' }: { chemin: string; alt: string; className?: string }) {
  if (/^https?:\/\//i.test(chemin)) {
    return <img src={chemin} alt={alt} className={`block w-full rounded-[14px] border border-trait ${className}`} />
  }
  return <Photo chemin={chemin} alt={alt} className={`mt-[18px] aspect-[16/10] w-full rounded-[14px] border border-trait md:mt-6 print:max-w-[62%] ${className}`} />
}

function ReponsesQuestion({ q }: { q: QuestionRapport }) {
  if (estQcm(q)) return <ListeChoix q={q} />
  const mes = (q.mes_reponses ?? []).map(String).filter((t) => t.trim())

  if (q.type === 'echelle') return <Echelle q={q} valeur={Number(q.mes_reponses?.[0])} />

  if (q.type === 'nuage') {
    return (
      <div className="mt-[18px] rounded-[14px] bg-fond px-4 py-6 text-center leading-[1.1]">
        {mes.length === 0 ? (
          <p className="text-sm text-sourdine">Tu n'as pas envoyé de mot pour cette question.</p>
        ) : (
          mes.map((m, i) => (
            <span
              key={i}
              className={`mx-2.5 my-1 inline-block font-titre [overflow-wrap:anywhere] ${['text-[26px] text-vertFonce', 'text-[46px] text-bleuViolet', 'text-[34px] text-vert'][i % 3]}`}
            >
              {m}
            </span>
          ))
        )}
        {mes.length > 0 && <small className="mt-3.5 block font-texte text-xs text-sourdine">Les mots que tu as choisis</small>}
      </div>
    )
  }

  if (q.type === 'atelier') {
    const etapes = q.etapes ?? []
    return (
      <ol className="mt-[18px] flex flex-col gap-3">
        {etapes.map((e, i) => (
          <li key={i} className="rounded-[14px] border border-trait px-4 py-3.5">
            <p className="text-[13px] font-semibold text-vertFonce">
              Étape {i + 1} · {e.titre}
            </p>
            {e.mon_rendu?.trim() ? (
              <p className="mt-2 whitespace-pre-line border-l-4 border-vert bg-fond px-4 py-3 text-base leading-relaxed [overflow-wrap:anywhere]">{e.mon_rendu}</p>
            ) : (
              <p className="mt-1 text-sm text-sourdine">Pas de rendu pour cette étape.</p>
            )}
          </li>
        ))}
      </ol>
    )
  }

  // Question ouverte (une ou plusieurs réponses)
  if (mes.length === 0) return <p className="mt-[18px] text-sm text-sourdine">Tu n'as pas répondu à cette question.</p>
  return (
    <div className="mt-[18px] flex flex-col gap-2.5">
      {mes.map((t, i) => (
        <blockquote key={i} className="whitespace-pre-line rounded-r-[14px] border-l-4 border-vert bg-fond px-[18px] py-4 text-base leading-[1.65] [overflow-wrap:anywhere]">
          « {t} »
          <small className="mt-2.5 block text-xs text-sourdine">{mes.length > 1 ? `Ta réponse ${i + 1}` : 'Ta réponse'}</small>
        </blockquote>
      ))}
    </div>
  )
}

function Echelle({ q, valeur }: { q: QuestionRapport; valeur: number }) {
  const niveaux = [1, 2, 3, 4, 5]
  if (!Number.isFinite(valeur) || valeur < 1 || valeur > 5) {
    return <p className="mt-[18px] text-sm text-sourdine">Tu n'as pas répondu à cette question.</p>
  }
  const pct = ((valeur - 1) / 4) * 100
  return (
    <div className="mt-[22px] px-1.5">
      <div className="relative mb-2.5 mt-[34px] h-2 rounded-lg bg-trait" role="img" aria-label={`Ta réponse : ${valeur} sur 5`}>
        <div className="absolute left-0 top-0 h-full rounded-lg bg-vert" style={{ width: `${pct}%` }} />
        {niveaux.map((n) => (
          <i
            key={n}
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-pilule border-2 ${
              n === valeur ? 'h-[26px] w-[26px] border-blanc bg-vert ring-2 ring-vert' : `h-[18px] w-[18px] bg-blanc ${n < valeur ? 'border-vert' : 'border-trait'}`
            }`}
            style={{ left: `${((n - 1) / 4) * 100}%` }}
          />
        ))}
        <span
          className="absolute -top-[34px] -translate-x-1/2 whitespace-nowrap rounded-pilule bg-bleuViolet px-3 py-[3px] text-xs font-semibold text-blanc"
          style={{ left: `${pct}%` }}
        >
          Ta réponse : {valeur} sur 5
        </span>
      </div>
      <div className="flex justify-between text-xs text-sourdine">
        <span>1{q.libelle_min ? ` · ${q.libelle_min}` : ''}</span>
        <span>5{q.libelle_max ? ` · ${q.libelle_max}` : ''}</span>
      </div>
    </div>
  )
}

function IconeChoix({ etat }: { etat: 'juste' | 'manque' | 'choix' | 'neutre' }) {
  const cls = 'h-[26px] w-[26px] flex-none'
  if (etat === 'juste')
    return (
      <svg className={cls} viewBox="0 0 26 26" aria-hidden>
        <circle cx="13" cy="13" r="13" fill="var(--couleur-vert)" />
        <path d="M7.5 13.5l3.7 3.7 7.3-8" fill="none" stroke="var(--couleur-blanc)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  if (etat === 'manque')
    return (
      <svg className={cls} viewBox="0 0 26 26" aria-hidden>
        <circle cx="13" cy="13" r="12" fill="var(--couleur-blanc)" stroke="var(--couleur-vert)" strokeWidth="2" />
        <path d="M7.5 13.5l3.7 3.7 7.3-8" fill="none" stroke="var(--couleur-vert)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  if (etat === 'choix')
    return (
      <svg className={cls} viewBox="0 0 26 26" aria-hidden>
        <circle cx="13" cy="13" r="12" fill="var(--couleur-blanc)" stroke="var(--couleur-sourdine)" strokeWidth="2" />
        <circle cx="13" cy="13" r="5" fill="var(--couleur-sourdine)" />
      </svg>
    )
  return (
    <svg className={`${cls} opacity-35`} viewBox="0 0 26 26" aria-hidden>
      <circle cx="13" cy="13" r="11.5" fill="none" stroke="var(--couleur-bleu-violet)" strokeWidth="2" />
    </svg>
  )
}

const STYLES_CHOIX = {
  juste: 'border-vert bg-juste text-vertFonce',
  manque: 'border-dashed border-vert text-vertFonce',
  choix: 'border-trait bg-neutre text-bleuViolet',
  neutre: 'border-trait text-sourdine',
} as const

function ListeChoix({ q }: { q: QuestionRapport }) {
  const choix = q.choix ?? []
  const mes = new Set(indices(q))
  const bonnes = q.bonnes_reponses ? new Set(q.bonnes_reponses) : null
  const multiple = q.type === 'qcm_multiple'

  const lignes = choix.map((texte, i) => {
    const choisi = mes.has(i)
    const bonne = bonnes?.has(i) ?? false
    let etat: keyof typeof STYLES_CHOIX = 'neutre'
    let tag = ''
    if (bonnes) {
      if (choisi && bonne) {
        etat = 'juste'
        tag = 'Ta réponse · juste'
      } else if (bonne) {
        etat = 'manque'
        tag = multiple ? 'À ne pas oublier' : 'La bonne réponse'
      } else if (choisi) {
        etat = 'choix'
        tag = 'Ton choix'
      }
    } else if (choisi) {
      etat = 'choix'
      tag = 'Ton choix'
    }
    return { texte, i, etat, tag, image: q.images_choix?.[i] ?? null }
  })

  let encouragement: ReactNode = null
  if (bonnes && multiple && bonnes.size > 0) {
    const trouvees = [...bonnes].filter((b) => mes.has(b)).length
    encouragement =
      trouvees === bonnes.size
        ? 'Tu as trouvé toutes les bonnes réponses : bravo !'
        : trouvees > 0
          ? `Tu as trouvé ${trouvees} des ${bonnes.size} bonnes réponses : c'est un très bon début.`
          : 'Les bonnes réponses sont en vert : garde-les en tête pour la prochaine fois.'
  } else if (bonnes && !multiple && mes.size > 0 && !qcmJuste(q)) {
    encouragement = "La bonne réponse est en vert : l'essentiel est de la retenir."
  }

  return (
    <>
      <ul className="mt-[18px] grid gap-2">
        {lignes.map((l) => (
          <li key={l.i} className={`flex flex-col gap-2 rounded-xl border-[1.5px] px-3.5 py-3 text-[15px] leading-snug md:px-[18px] md:py-3.5 md:text-base print:px-3 print:py-2 print:text-[10.5pt] ${STYLES_CHOIX[l.etat]}`}>
            <div className="flex items-center gap-3">
              <IconeChoix etat={l.etat} />
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{l.texte}</span>
              {l.tag && <span className="ml-auto hidden whitespace-nowrap pl-2 text-xs font-semibold md:inline print:inline">{l.tag}</span>}
            </div>
            {l.tag && <span className="ml-[38px] text-xs font-semibold md:hidden print:hidden">{l.tag}</span>}
            {l.image && !/^https?:\/\//i.test(l.image) && <Photo chemin={l.image} alt={l.texte} className="ml-[38px] aspect-[16/10] w-40 rounded-lg" />}
          </li>
        ))}
      </ul>
      {encouragement && <p className="mt-3 text-sm font-semibold text-vertFonce">{encouragement}</p>}
    </>
  )
}

