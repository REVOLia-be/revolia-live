import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Bouton from '../Bouton'
import { appelerRpc } from '../../lib/api'
import { messageErreur } from '../../lib/erreurs'
import { supabase } from '../../lib/supabase'

const formatLancee = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// Lancement d'un quiz en direct : partagé entre « Mes quiz » et l'éditeur.
export default function PanneauLancement({
  quizId,
  libelle = 'Lancer',
  desactive = false,
  raisonDesactive,
}: {
  quizId: string
  libelle?: string
  desactive?: boolean
  raisonDesactive?: string
}) {
  const navigate = useNavigate()
  const [parTable, setParTable] = useState(false)
  const [noms, setNoms] = useState('')
  const [lancement, setLancement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState<string | null>(null) // date de lancement d'une session non terminée de ce quiz, à confirmer

  // Avant de lancer : y a-t-il déjà une session non terminée pour ce quiz ? La relancer l'archiverait.
  async function verifierPuisLancer() {
    setLancement(true)
    setErreur(null)
    try {
      const { data } = await supabase
        .from('sessions')
        .select('id, cree_le')
        .eq('quiz_id', quizId)
        .neq('etat', 'terminee')
        .order('cree_le', { ascending: false })
        .limit(1)
      const existante = data?.[0] as { cree_le: string } | undefined
      if (existante) {
        const d = new Date(existante.cree_le)
        setEnCours(Number.isNaN(d.getTime()) ? 'une date inconnue' : formatLancee.format(d))
        setLancement(false)
        return
      }
    } catch {
      // la vérification est une aide : si elle échoue, le lancement continue
    }
    await lancer()
  }

  async function lancer() {
    setLancement(true)
    setErreur(null)
    setEnCours(null)
    try {
      const tables = noms
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
      const resultat = await appelerRpc<{ session_id: string; code: string }>('lancer_session', {
        p_quiz: quizId,
        p_mode_tables: parTable,
        p_noms_tables: parTable ? tables : null,
      })
      navigate(`/presenter/${resultat.session_id}`)
    } catch (e) {
      setErreur(messageErreur(e))
      setLancement(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex min-h-[44px] items-center gap-3 text-lg">
        <input
          type="checkbox"
          checked={parTable}
          onChange={(e) => setParTable(e.target.checked)}
          className="h-6 w-6 accent-vert"
        />
        Mode par table
      </label>
      <p className="-mt-2 text-base">Les participants choisissent leur table en arrivant. La salle garde une seule jauge : pas de comparaison entre tables.</p>
      {parTable && (
        <input
          value={noms}
          onChange={(e) => setNoms(e.target.value)}
          aria-label="Noms des tables, séparés par des virgules"
          placeholder="Noms des tables, séparés par des virgules (ex. Table 1, Table 2, Table 3)"
          className="min-h-[56px] w-full rounded-champ border-2 border-vert bg-blanc px-4 text-lg text-vertFonce placeholder:text-discret"
        />
      )}
      {erreur && (
        <p role="alert" className="text-lg font-semibold">
          {erreur}
        </p>
      )}
      {desactive && raisonDesactive && <p className="text-base">{raisonDesactive}</p>}
      {enCours ? (
        <div role="alertdialog" aria-label="Confirmer le lancement" className="flex flex-col gap-3 rounded-champ border-2 border-vert p-4">
          <p className="text-lg font-semibold">
            Une session de ce quiz est en cours (lancée le {enCours}). La lancer à nouveau l'archivera. Continuer ?
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Bouton type="button" onClick={() => void lancer()} disabled={lancement}>
              {lancement ? 'Lancement…' : 'Oui, lancer et archiver'}
            </Bouton>
            <Bouton type="button" variante="secondaire" onClick={() => setEnCours(null)} disabled={lancement}>
              Non, annuler
            </Bouton>
          </div>
        </div>
      ) : (
        <Bouton type="button" onClick={() => void verifierPuisLancer()} disabled={lancement || desactive}>
          {lancement ? 'Lancement…' : libelle}
        </Bouton>
      )}
      <p className="text-base">Ouvre l'écran à projeter. Mets-le sur le vidéoprojecteur (F11 pour le plein écran).</p>
    </div>
  )
}
