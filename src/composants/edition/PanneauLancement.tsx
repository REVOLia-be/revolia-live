import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Bouton from '../Bouton'
import { appelerRpc } from '../../lib/api'
import { messageErreur } from '../../lib/erreurs'

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

  async function lancer() {
    setLancement(true)
    setErreur(null)
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
      {parTable && (
        <input
          value={noms}
          onChange={(e) => setNoms(e.target.value)}
          aria-label="Noms des tables, séparés par des virgules"
          placeholder="Noms des tables, séparés par des virgules (ex. Table 1, Table 2, Table 3)"
          className="min-h-[56px] w-full rounded-champ border-2 border-vert bg-blanc px-4 text-lg text-vertFonce placeholder:text-vertClair focus:outline-none focus:ring-4 focus:ring-vertClair"
        />
      )}
      {erreur && (
        <p role="alert" className="text-lg font-semibold">
          {erreur}
        </p>
      )}
      {desactive && raisonDesactive && <p className="text-base">{raisonDesactive}</p>}
      <Bouton type="button" onClick={lancer} disabled={lancement || desactive}>
        {lancement ? 'Lancement…' : libelle}
      </Bouton>
    </div>
  )
}
