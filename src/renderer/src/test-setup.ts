import { useLocale } from '@/i18n'
import { setMainLocale } from '../../main/i18n'

// Les tests vérifient les textes français (langue de référence) ; ceux qui testent une autre langue la choisissent eux-mêmes.
useLocale.setState({ locale: 'fr' })
setMainLocale('fr')
