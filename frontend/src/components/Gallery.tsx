import { TRACKS, trackUrl } from '../tracks'

interface Props {
  activeId: string | null
  onPick: (id: string) => void
  disabled?: boolean
}

export function Gallery({ activeId, onPick, disabled }: Props) {
  return (
    <ul className="gallery" aria-label="Earth Jukebox tracks">
      {TRACKS.map((t) => (
        <li key={t.id}>
          <button
            className={`sample${activeId === t.id ? ' active' : ''}`}
            onClick={() => onPick(t.id)}
            disabled={disabled}
            aria-pressed={activeId === t.id}
            aria-describedby={`track-${t.id}`}
          >
            <img src={trackUrl(t)} alt="" loading="lazy" />
            {t.frames && <em className="badge">Time-lapse</em>}
            <span>{t.title}</span>
          </button>
          <span id={`track-${t.id}`} className="sr-only">{t.about}</span>
        </li>
      ))}
    </ul>
  )
}
