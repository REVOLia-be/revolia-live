import { useState } from 'react'
import { Link } from 'react-router-dom'
import { exporterSession } from '../../lib/exporter'
import { messageErreur } from '../../lib/erreurs'
import Bouton from '../Bouton'
import JaugeCollective from '../JaugeCollective'
import Confettis from './Confettis'
import ZonesEcran from './ZonesEcran'
import NuageDeMots from './NuageDeMots'
import type { Bilan, EtatSession, NomMention } from '../../lib/session'

// Bilan de salle festif. AUCUN classement, aucun chiffre individuel :
// on célèbre ce que la salle a fait ensemble, puis les mentions positives.

const LIBELLES: Record<NomMention, string> = {
  a_repondu_a_tout: 'Ont répondu à tout',
  plus_belle_progression: 'Plus belle progression',
  coup_de_coeur: 'Réponse coup de cœur',
}

type Section = 'jauge' | 'chiffres' | 'nuage' | 'coeurs' | 'mentions'

// Seules les sections qui ont du contenu sont présentées.
function sectionsDuBilan(bilan: Bilan): Section[] {
  const sections: Section[] = ['jauge', 'chiffres']
  if (bilan.nuage.length > 0) sections.push('nuage')
  if (bilan.mentions.some((m) => m.type === 'coup_de_coeur' && m.texte)) sections.push('coeurs')
  if (bilan.mentions.length > 0) sections.push('mentions')
  return sections
}

interface Props {
  etat: EtatSession
  enCours: boolean
  erreur: string | null
  onTerminer: () => void
}

export default function EcranBilan({ etat, enCours, erreur, onTerminer }: Props) {
  const bilan = etat.bilan
  const sections = bilan ? sectionsDuBilan(bilan) : []
  const derniere = sections.length - 1
  // Si le formateur recharge la page sur un quiz terminé, on montre directement la fin.
  const [indice, setIndice] = useState(etat.etat === 'terminee' ? derniere : 0)

  // Pas de défilement automatique : le formateur commente à son rythme (Précédent / Suite).
  const [exportEnCours, setExportEnCours] = useState(false)
  const [erreurExport, setErreurExport] = useState<string | null>(null)
  async function exporter() {
    setExportEnCours(true)
    setErreurExport(null)
    try {
      await exporterSession(etat.session_id, etat.titre)
    } catch (e) {
      setErreurExport(messageErreur(e))
    } finally {
      setExportEnCours(false)
    }
  }

  if (!bilan) return <p>Un instant…</p>
  const fini = indice >= derniere
  // `key` : chaque section rejoue son animation d'apparition.
  const section = sections[Math.min(indice, derniere)]

  const termine = fini && etat.etat === 'terminee'
  const boutonPrecedent =
    indice > 0 ? (
      <Bouton type="button" variante="secondaire" onClick={() => setIndice((i) => Math.max(0, i - 1))}>
        Précédent
      </Bouton>
    ) : null
  const boutonSuite = !fini ? (
    <Bouton type="button" onClick={() => setIndice((i) => i + 1)}>
      Suite
    </Bouton>
  ) : termine ? (
    <Link to="/formateur" className="block w-full">
      <Bouton type="button" variante="secondaire">
        Retour à mes quiz
      </Bouton>
    </Link>
  ) : (
    <Bouton type="button" onClick={onTerminer} disabled={enCours}>
      Terminer
    </Bouton>
  )
  const pied = (
    <div className="flex flex-col gap-[1vh]">
      {termine && (
        <Bouton type="button" onClick={() => void exporter()} disabled={exportEnCours}>
          {exportEnCours ? 'Export en cours…' : 'Exporter les résultats (CSV)'}
        </Bouton>
      )}
      <div className="flex gap-[1vw]">
        {boutonPrecedent}
        {boutonSuite}
      </div>
    </div>
  )

  return (
    <ZonesEcran erreur={erreur ?? erreurExport} pied={pied}>
      {fini && <Confettis />}
      <h1 className="shrink-0 text-[1.2em] leading-tight">{etat.etat === 'terminee' ? 'Quiz terminé. Merci à tous !' : 'Bilan de la salle'}</h1>

      <div key={section} className="animation-apparition min-h-0 flex-1 overflow-hidden">
        {section === 'jauge' && <SectionJauge bilan={bilan} />}
        {section === 'chiffres' && <SectionChiffres bilan={bilan} />}
        {section === 'nuage' && (
          <>
            <p className="mb-[2vh] font-semibold text-vertClair">Les mots de la journée</p>
            <NuageDeMots mots={bilan.nuage} />
          </>
        )}
        {section === 'coeurs' && <SectionCoeurs bilan={bilan} />}
        {section === 'mentions' && <SectionMentions bilan={bilan} />}
      </div>
    </ZonesEcran>
  )
}

function SectionJauge({ bilan }: { bilan: Bilan }) {
  const { paliers, paliers_atteints } = bilan.jauge
  return (
    <div className="flex flex-col gap-[3vh]">
      <p className="font-semibold text-vertClair">Ce que la salle a construit ensemble</p>
      <JaugeCollective jauge={bilan.jauge} variante="grande" />
      <p className="text-[1.1em] font-bold">
        {paliers.length === 0
          ? 'Bravo à toute la salle !'
          : paliers_atteints >= paliers.length
            ? `Tous les paliers sont atteints (${paliers.length} sur ${paliers.length}) !`
            : `${paliers_atteints} palier${paliers_atteints > 1 ? 's' : ''} atteint${paliers_atteints > 1 ? 's' : ''} sur ${paliers.length}`}
      </p>
    </div>
  )
}

function Chiffre({ valeur, libelle }: { valeur: string | number; libelle: string }) {
  return (
    <div className="flex flex-col items-center gap-[1vh] rounded-carte border-2 border-blanc px-[2vw] py-[3vh] text-center">
      <span className="font-titre text-[2.6em] font-normal leading-none text-vertClair">{valeur}</span>
      <span className="text-[0.8em]">{libelle}</span>
    </div>
  )
}

function SectionChiffres({ bilan }: { bilan: Bilan }) {
  return (
    <div className="grid grid-cols-3 gap-[2vw]">
      <Chiffre valeur={bilan.nb_participants} libelle="participants" />
      <Chiffre valeur={bilan.nb_reponses} libelle="réponses" />
      {bilan.taux_reussite_qcm != null && (
        <Chiffre valeur={`${bilan.taux_reussite_qcm} %`} libelle="de bonnes réponses aux QCM" />
      )}
    </div>
  )
}

// Les coups de cœur : textes seuls, sans pseudo.
function SectionCoeurs({ bilan }: { bilan: Bilan }) {
  const textes = bilan.mentions.filter((m) => m.type === 'coup_de_coeur' && m.texte).map((m) => m.texte as string)
  return (
    <div className="flex flex-col gap-[2vh]">
      <p className="font-semibold text-vertClair">♥ Les coups de cœur</p>
      <ul className="grid grid-cols-2 gap-[1.5vh] text-[0.7em]">
        {textes.map((t, i) => (
          <li key={i} className="rounded-carte bg-blanc p-[1.2vw] text-bleuViolet">
            {t}
          </li>
        ))}
      </ul>
    </div>
  )
}

// Cartes chaleureuses groupées par type de mention.
function SectionMentions({ bilan }: { bilan: Bilan }) {
  const groupes = (Object.keys(LIBELLES) as NomMention[])
    .map((type) => ({ type, pseudos: [...new Set(bilan.mentions.filter((m) => m.type === type).map((m) => m.pseudo))] }))
    .filter((g) => g.pseudos.length > 0)
  return (
    <div className="flex flex-col gap-[2vh]">
      <p className="font-semibold text-vertClair">Bravo à…</p>
      <ul className="grid grid-cols-2 gap-[2vh]">
        {groupes.map((g) => (
          <li key={g.type} className="rounded-carte border-2 border-vertClair p-[1.5vw]">
            <p className="mb-[1vh] text-[0.8em] font-bold text-vertClair">{LIBELLES[g.type]}</p>
            <p className="text-[0.75em]">{g.pseudos.join(' · ')}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
