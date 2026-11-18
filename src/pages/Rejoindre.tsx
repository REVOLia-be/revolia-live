import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Bouton from '../composants/Bouton'
import MiseEnPageParticipant from '../composants/MiseEnPageParticipant'

export default function Rejoindre() {
  const { code } = useParams()
  const [pseudo, setPseudo] = useState('')
  const navigate = useNavigate()

  function valider(e: FormEvent) {
    e.preventDefault()
    if (pseudo.trim()) navigate(`/jouer/${code}`)
  }

  return (
    <MiseEnPageParticipant>
      <h1 className="text-4xl">Choisis ton pseudo</h1>
      <p className="text-lg">
        Il s'affichera dans la salle. Pas besoin de compte.
      </p>
      <form onSubmit={valider} className="flex flex-col gap-4">
        <input
          value={pseudo}
          onChange={(e) => setPseudo(e.target.value)}
          maxLength={30}
          autoComplete="off"
          aria-label="Ton pseudo"
          placeholder="Ton pseudo"
          className="min-h-[56px] w-full rounded-champ border-2 border-vert bg-blanc px-4 text-xl text-vertFonce placeholder:text-vertClair focus:outline-none focus:ring-4 focus:ring-vertClair"
        />
        {/* Emplacement du choix de table, masqué pour l'instant. */}
        <div hidden id="choix-table" />
        <Bouton type="submit" disabled={!pseudo.trim()}>
          Entrer dans la salle
        </Bouton>
      </form>
    </MiseEnPageParticipant>
  )
}
