import Bouton from '../Bouton'
import { Coche } from '../Pictos'
import ZonesEcran from './ZonesEcran'
import ContenuAjuste from './ContenuAjuste'
import { personnes } from '../../lib/atelier'
import type { EtatSession } from '../../lib/session'

interface Props {
  etat: EtatSession
  enCours: boolean
  erreur: string | null
  onSuivante: () => void
  onBilan: () => void
}

// Après « Terminer l'atelier » : petit récapitulatif collectif, puis le bouton habituel pour continuer le déroulé.
export default function EcranResultatsAtelier({ etat, enCours, erreur, onSuivante, onBilan }: Props) {
  const question = etat.question!
  const dernier = question.ordre >= etat.nb_questions
  const nbEtapes = question.etapes?.length ?? 0
  const termines = etat.atelier?.ont_termine

  return (
    <ZonesEcran
      code={etat.code}
      erreur={erreur}
      pied={
        dernier ? (
          <Bouton type="button" data-commande="suivant" onClick={onBilan} disabled={enCours}>
            Voir le bilan
          </Bouton>
        ) : (
          <Bouton type="button" data-commande="suivant" onClick={onSuivante} disabled={enCours}>
            Question suivante
          </Bouton>
        )
      }
    >
      <ContenuAjuste cle={`atelier-fin-${question.id}`} niveaux={1} plancherEm={0.62}>
        {() => (
          <div className="my-auto flex flex-col gap-[2.5vh]">
            <p className="flex items-center gap-[1vw] [font-size:max(0.5em,14px)] font-semibold text-vertClair">
              <span className="flex h-[1.6em] w-[1.6em] items-center justify-center rounded-pilule bg-vert text-blanc">
                <Coche taille={24} trace className="h-[70%] w-[70%]" />
              </span>
              Atelier terminé
            </p>
            <h1 data-texte-principal className="text-[1.1em] leading-tight [overflow-wrap:anywhere]">{question.enonce}</h1>
            <ul className="flex flex-col gap-[1.2vh] text-[0.7em] leading-tight">
              {typeof termines === 'number' && (
                <li>
                  <strong>{termines} sur {etat.nb_participants}</strong> {termines > 1 ? 'ont' : 'a'} fait tout l'atelier.
                </li>
              )}
              {nbEtapes > 0 && <li>{personnes(etat.nb_participants)} dans la salle, {nbEtapes} étape{nbEtapes > 1 ? 's' : ''} proposée{nbEtapes > 1 ? 's' : ''}.</li>}
              <li className="text-vertClair">Bravo à toute la salle : chacun a avancé à son rythme.</li>
            </ul>
          </div>
        )}
      </ContenuAjuste>
    </ZonesEcran>
  )
}
