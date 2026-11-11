import { create } from 'zustand'
import { useLocale } from '@/i18n'
import { useEditor } from '@/store/editor'
import { DEFAULT_RATE, Reader, clampRate, pickVoice, readingItems, type ReadScope, type ReaderState, type SynthLike, type UtteranceLike, type VoiceInfo } from '@/speech'

const KEY = 'trame.speech'
const SCOPES: ReadScope[] = ['selection', 'page', 'all']

/** Le moteur de synthèse du navigateur (les voix du système), s'il existe ; lu à chaque appel pour que les tests puissent le remplacer. */
const synth = (): SpeechSynthesis | null => (typeof window !== 'undefined' ? ((window as { speechSynthesis?: SpeechSynthesis }).speechSynthesis ?? null) : null)

/** Les vraies voix, pour les passer au moteur ; l'interface ne manipule que leurs descriptions (`VoiceInfo`). */
let nativeVoices: SpeechSynthesisVoice[] = []
let listening = false

function stored(): { voiceUri: string; rate: number; scope: ReadScope } {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>
    return { voiceUri: typeof o.voiceUri === 'string' ? o.voiceUri.slice(0, 300) : '', rate: clampRate(o.rate), scope: SCOPES.includes(o.scope as ReadScope) ? (o.scope as ReadScope) : 'page' }
  } catch {
    return { voiceUri: '', rate: DEFAULT_RATE, scope: 'page' }
  }
}

interface SpeechStore {
  voices: VoiceInfo[]
  voiceUri: string
  rate: number
  scope: ReadScope
  state: ReaderState
  /** texte en cours (à partir de 0), nombre de textes, numéro de la page lue */
  item: number
  total: number
  page: number
  message: 'empty' | 'failed' | 'unavailable' | null
  loadVoices: () => void
  setVoice: (uri: string) => void
  setRate: (rate: number) => void
  setScope: (scope: ReadScope) => void
  play: () => void
  pause: () => void
  resume: () => void
  stop: () => void
}

export const useSpeech = create<SpeechStore>((set, get) => {
  const save = (): void => {
    const { voiceUri, rate, scope } = get()
    try {
      localStorage.setItem(KEY, JSON.stringify({ voiceUri, rate, scope }))
    } catch {
      /* le choix vaut pour la session */
    }
  }

  const reader = new Reader(
    synth as () => SynthLike | null, // SpeechSynthesis a plus de membres que ce dont le lecteur a besoin
    (text) => new SpeechSynthesisUtterance(text) as unknown as UtteranceLike,
    () => {
      const locale = useLocale.getState().locale
      const v = pickVoice(get().voices, locale, get().voiceUri)
      return { lang: v?.lang || locale, rate: get().rate, voice: v ? nativeVoices.find((n) => n.voiceURI === v.voiceURI) ?? null : null }
    },
    {
      change: (state, item, total) => set({ state, item, total }),
      item: (it) => {
        // le texte a pu disparaître (document remplacé, texte supprimé) : on arrête plutôt que de lire dans le vide
        const { doc } = useEditor.getState()
        if (!doc.pages.find((p) => p.id === it.pageId)?.elements.some((e) => e.id === it.elementId)) {
          reader.stop()
          return
        }
        set({ page: it.pageIndex + 1 })
        // la sélection est déjà à l'écran ; page ou document : on montre le texte lu
        if (get().scope !== 'selection') useEditor.getState().revealElement(it.pageId, it.elementId)
      },
      failed: () => set({ message: 'failed' })
    }
  )

  if (typeof window !== 'undefined') window.addEventListener('beforeunload', () => synth()?.cancel())

  return {
    ...stored(),
    voices: [],
    state: 'idle',
    item: 0,
    total: 0,
    page: 1,
    message: null,

    loadVoices: () => {
      const s = synth()
      const read = (): void => {
        nativeVoices = s?.getVoices() ?? []
        set({ voices: nativeVoices.map((v) => ({ voiceURI: v.voiceURI, name: v.name, lang: v.lang, local: v.localService })) })
      }
      read()
      // Chromium charge les voix après coup : l'événement dit quand elles arrivent
      if (s && !listening && typeof s.addEventListener === 'function') {
        listening = true
        s.addEventListener('voiceschanged', read)
      }
    },
    setVoice: (voiceUri) => {
      set({ voiceUri })
      save()
    },
    setRate: (rate) => {
      set({ rate: clampRate(rate) })
      save()
    },
    setScope: (scope) => {
      set({ scope })
      save()
    },
    play: () => {
      const { doc, pageId, selectedIds } = useEditor.getState()
      const items = readingItems(doc, get().scope, pageId, selectedIds)
      set({ message: null })
      if (!items.length) return set({ message: 'empty' })
      if (!reader.play(items)) set({ message: synth() ? 'empty' : 'unavailable' })
    },
    pause: () => reader.pause(),
    resume: () => reader.resume(),
    stop: () => reader.stop()
  }
})
