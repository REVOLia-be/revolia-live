import { Link } from 'react-router-dom'
import Bouton from '../composants/Bouton'
import MiseEnPageParticipant from '../composants/MiseEnPageParticipant'

export default function PageIntrouvable() {
  return (
    <MiseEnPageParticipant>
      <h1 className="text-4xl">Cette page n'existe pas</h1>
      <p className="text-lg">Le lien est peut-être incorrect. Reviens à l'accueil pour rejoindre un quiz.</p>
      <Link to="/">
        <Bouton type="button">Retour à l'accueil</Bouton>
      </Link>
    </MiseEnPageParticipant>
  )
}
