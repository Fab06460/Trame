import { createRoot } from 'react-dom/client'
import App from './App'
import { loadFonts } from './fonts'
import { loadInstalledFonts } from './store/fonts'
import './styles.css'

// les polices ajoutées en ligne sont prêtes avant le premier affichage (sinon le texte serait mesuré avec une police de remplacement)
Promise.all([loadFonts(), loadInstalledFonts()]).then(() => createRoot(document.getElementById('root')!).render(<App />))
