import { Link } from 'react-router-dom'
import type { LienSuivi } from '../../lib/rapport'

// Bloc « Prochaines étapes » : même rendu sur la page du rapport et dans les aperçus d'administration.
// Le premier lien est mis en avant (grand bouton), les suivants deviennent des cartes.
export default function ProchainesEtapes({
  liens,
  jetonNewsletter = null,
  newsletterConfirmee = false,
  apercu = false,
}: {
  liens: LienSuivi[]
  jetonNewsletter?: string | null
  newsletterConfirmee?: boolean
  /** Aperçu d'administration : pas de jeton réel, boutons non cliquables. */
  apercu?: boolean
}) {
  const montrerNewsletter = apercu ? jetonNewsletter !== null : !!jetonNewsletter
  if (liens.length === 0 && !montrerNewsletter && !newsletterConfirmee) return null
  const [premier, ...autres] = liens
  const bouton =
    'mt-[22px] inline-flex min-h-[56px] items-center rounded-[14px] bg-vert px-[26px] text-base font-semibold text-blanc hover:bg-vertFonce print:border print:border-blanc'

  return (
    <section className="rapport-icone-fond relative mx-auto mt-11 max-w-[880px] overflow-hidden rounded-[24px] bg-bleuViolet px-[22px] py-[34px] text-blanc md:px-14 md:py-[60px] print:mt-0 print:break-before-page print:rounded-[14px] print:p-[34px]">
      <div className="relative z-10">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-vertClair">Prochaines étapes</p>
        <h2 className="mb-2.5 mt-2.5 text-[30px] leading-[1.15] md:text-[42px] print:text-[30px]">Ce que tu viens de voir ne demande qu'à servir.</h2>
        <p className="max-w-[560px] text-[15px] text-blancDoux">
          Continue à pratiquer, avec nous à tes côtés. {premier ? premier.texte : ''}
        </p>
        {premier && (apercu ? <span className={bouton}>{premier.bouton} →</span> : <a className={bouton} href={premier.url} target="_blank" rel="noopener noreferrer">{premier.bouton} →</a>)}

        {autres.length > 0 && (
          <div className="mt-[30px] grid gap-3 md:grid-cols-3 md:gap-[18px] print:grid-cols-3 print:gap-3">
            {autres.map((l, i) => (
              <div key={i} className="rounded-[16px] border border-voileTrait bg-voile p-[18px]">
                <h3 className="mb-1 text-base font-semibold [overflow-wrap:anywhere]">{l.titre}</h3>
                <p className="text-[13.5px] text-blancDoux [overflow-wrap:anywhere]">{l.texte}</p>
                {apercu ? (
                  <span className="mt-2.5 inline-block text-sm font-semibold text-vertClair">{l.bouton} →</span>
                ) : (
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="mt-2.5 inline-flex min-h-[44px] items-center text-sm font-semibold text-vertClair underline print:after:block print:after:text-[8pt] print:after:font-normal print:after:content-[attr(href)]">
                    {l.bouton} →
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {montrerNewsletter && (
          <div className="mt-8 border-t border-voileTrait pt-6 print:hidden">
            {apercu ? (
              <span className={bouton + ' mt-0 text-left'}>Je veux continuer à recevoir les nouvelles de REVOLia</span>
            ) : (
              <Link to={`/newsletter/${jetonNewsletter}`} className={bouton + ' mt-0 text-left'}>
                Je veux continuer à recevoir les nouvelles de REVOLia
              </Link>
            )}
            <p className="mt-2 text-[13px] text-blancDoux">Un seul clic suffit. Tu pourras te désinscrire à tout moment.</p>
          </div>
        )}
        {newsletterConfirmee && !apercu && (
          <p className="mt-8 border-t border-voileTrait pt-6 text-[15px] text-blancDoux print:hidden">Tu es inscrit(e) aux nouvelles de REVOLia. Merci !</p>
        )}
      </div>
    </section>
  )
}
