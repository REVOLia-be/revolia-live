import { useState, type FormEvent } from 'react'
import Bouton from '../composants/Bouton'
import MiseEnPageParticipant from '../composants/MiseEnPageParticipant'

export default function ConnexionFormateur() {
  const [email, setEmail] = useState('')

  function valider(e: FormEvent) {
    e.preventDefault()
    // Pas encore branché : l'envoi du lien magique viendra plus tard.
  }

  return (
    <MiseEnPageParticipant>
      <h1 className="text-4xl">Espace formateur</h1>
      <p className="text-lg">
        Entre ton email : on t'envoie un lien pour te connecter, sans mot de passe.
      </p>
      <form onSubmit={valider} className="flex flex-col gap-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          aria-label="Ton adresse email"
          placeholder="prenom@exemple.be"
          className="min-h-[56px] w-full rounded-champ border-2 border-vert bg-blanc px-4 text-xl text-vertFonce placeholder:text-vertClair focus:outline-none focus:ring-4 focus:ring-vertClair"
        />
        <Bouton type="submit">Recevoir mon lien</Bouton>
      </form>
    </MiseEnPageParticipant>
  )
}
