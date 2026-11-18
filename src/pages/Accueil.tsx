import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import Bouton from '../composants/Bouton'
import MiseEnPageParticipant from '../composants/MiseEnPageParticipant'

export default function Accueil() {
  const [code, setCode] = useState('')
  const navigate = useNavigate()

  function valider(e: FormEvent) {
    e.preventDefault()
    if (code.length === 6) navigate(`/rejoindre/${code}`)
  }

  return (
    <MiseEnPageParticipant>
      <h1 className="text-4xl">Rejoins le quiz</h1>
      <p className="text-lg">Entre le code affiché sur l'écran de la salle.</p>
      <form onSubmit={valider} className="flex flex-col gap-4">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          maxLength={6}
          autoCapitalize="characters"
          autoComplete="off"
          inputMode="text"
          aria-label="Code du quiz"
          placeholder="ABC123"
          className="min-h-[72px] w-full rounded-champ border-2 border-vert bg-blanc px-4 text-center text-4xl font-bold uppercase tracking-[0.3em] text-vertFonce placeholder:text-vertClair focus:outline-none focus:ring-4 focus:ring-vertClair"
        />
        <Bouton type="submit" disabled={code.length !== 6}>
          Rejoindre
        </Bouton>
      </form>
    </MiseEnPageParticipant>
  )
}
