import { createRoot } from 'react-dom/client'
import App from './App'
import { SpeakerView } from './components/SpeakerView'
import { loadFonts } from './fonts'
import { loadInstalledFonts } from './store/fonts'
import './styles.css'

// les polices ajoutées en ligne sont prêtes avant le premier affichage (sinon le texte serait mesuré avec une police de remplacement)
Promise.all([loadFonts(), loadInstalledFonts()]).then(() =>
  // la même page sert à la fenêtre principale et à l'écran de l'orateur (seconde fenêtre, adresse « #speaker »)
  createRoot(document.getElementById('root')!).render(location.hash === '#speaker' ? <SpeakerView /> : <App />)
)
