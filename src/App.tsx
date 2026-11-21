import { Route, Routes } from 'react-router-dom'
import Accueil from './pages/Accueil'
import Rejoindre from './pages/Rejoindre'
import Jouer from './pages/Jouer'
import ConnexionFormateur from './pages/ConnexionFormateur'
import MesQuiz from './pages/MesQuiz'
import MesSessions from './pages/MesSessions'
import Utilisation from './pages/Utilisation'
import EditionQuiz from './pages/EditionQuiz'
import Presenter from './pages/Presenter'
import PageIntrouvable from './pages/PageIntrouvable'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Accueil />} />
      <Route path="/rejoindre/:code" element={<Rejoindre />} />
      <Route path="/jouer/:code" element={<Jouer />} />
      <Route path="/formateur/connexion" element={<ConnexionFormateur />} />
      <Route path="/formateur" element={<MesQuiz />} />
      <Route path="/formateur/sessions" element={<MesSessions />} />
      <Route path="/formateur/utilisation" element={<Utilisation />} />
      <Route path="/formateur/quiz/:id" element={<EditionQuiz />} />
      <Route path="/presenter/:sessionId" element={<Presenter />} />
      <Route path="*" element={<PageIntrouvable />} />
    </Routes>
  )
}
