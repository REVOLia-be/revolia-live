import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Bouton from '../composants/Bouton'
import MiseEnPageParticipant from '../composants/MiseEnPageParticipant'
import { appelerRpc } from '../lib/api'
import { assurerConnexionAnonyme } from '../lib/auth'
import { messageErreur } from '../lib/erreurs'
import { lireSalle, memoriserSalle } from '../lib/memoire'

interface InfosSession {
  session_id: string
  titre: string
  mode_tables: boolean
  tables: { id: string; nom: string }[]
}

export default function Rejoindre() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [infos, setInfos] = useState<InfosSession | null>(null)
  const [erreurChargement, setErreurChargement] = useState<string | null>(null)
  const [pseudo, setPseudo] = useState(() => lireSalle(code)?.pseudo ?? '')
  const [tableId, setTableId] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    let actif = true
    ;(async () => {
      try {
        await assurerConnexionAnonyme()
        const donnees = await appelerRpc<InfosSession>('infos_session', { p_code: code })
        if (actif) setInfos(donnees)
      } catch (e) {
        if (actif) setErreurChargement(messageErreur(e))
      }
    })()
    return () => {
      actif = false
    }
  }, [code])

  async function valider(e: FormEvent) {
    e.preventDefault()
    if (!infos || !pseudo.trim() || envoi) return
    setEnvoi(true)
    setErreur(null)
    try {
      const resultat = await appelerRpc<{ session_id: string; pseudo: string }>('rejoindre_session', {
        p_code: code,
        p_pseudo: pseudo,
        p_table_id: infos.mode_tables ? tableId : null,
      })
      memoriserSalle(code, { sessionId: resultat.session_id, pseudo: resultat.pseudo })
      navigate(`/jouer/${code}`)
    } catch (e2) {
      setErreur(messageErreur(e2))
      setEnvoi(false)
    }
  }

  if (erreurChargement) {
    return (
      <MiseEnPageParticipant>
        <h1 className="text-3xl">On ne trouve pas ce quiz</h1>
        <p className="text-lg">{erreurChargement}</p>
        <Bouton type="button" onClick={() => navigate('/')}>
          Entrer un autre code
        </Bouton>
      </MiseEnPageParticipant>
    )
  }

  if (!infos) {
    return (
      <MiseEnPageParticipant>
        <p className="text-lg">Un instant…</p>
      </MiseEnPageParticipant>
    )
  }

  const peutEntrer = pseudo.trim() !== '' && (!infos.mode_tables || tableId !== null)

  return (
    <MiseEnPageParticipant>
      <h1 className="text-4xl">{infos.mode_tables ? 'Choisis ta table' : 'Choisis ton pseudo'}</h1>
      <p className="text-lg">
        {infos.mode_tables
          ? "Touche ta table, puis choisis ton pseudo. Il s'affichera dans la salle, pas besoin de compte."
          : "Il s'affichera dans la salle. Pas besoin de compte."}
      </p>
      <form onSubmit={valider} className="flex flex-col gap-4">
        {infos.mode_tables && (
          <div className="grid grid-cols-2 gap-3">
            {infos.tables.map((table) => (
              <Bouton
                key={table.id}
                type="button"
                variante={tableId === table.id ? 'principal' : 'secondaire'}
                aria-pressed={tableId === table.id}
                className="px-3"
                onClick={() => setTableId(table.id)}
              >
                {table.nom}
              </Bouton>
            ))}
          </div>
        )}

        {/* En mode par table, le pseudo n'apparaît qu'après le choix de la table : le clavier ne cache plus rien. */}
        {(!infos.mode_tables || tableId !== null) && (
          <input
            autoFocus
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
            maxLength={20}
            autoComplete="off"
            aria-label="Ton pseudo"
            placeholder="Ton pseudo"
            className="min-h-[56px] w-full rounded-champ border-2 border-vert bg-blanc px-4 text-xl text-vertFonce placeholder:text-discret"
          />
        )}

        {erreur && (
          <p role="alert" className="text-lg font-semibold">
            {erreur}
          </p>
        )}
        <Bouton type="submit" disabled={!peutEntrer || envoi}>
          {envoi ? 'Un instant…' : 'Entrer dans la salle'}
        </Bouton>
      </form>
    </MiseEnPageParticipant>
  )
}
