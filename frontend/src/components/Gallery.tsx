import { SAMPLES, sampleUrl } from '../samples'

interface Props {
  activeId: string | null
  onPick: (id: string) => void
  disabled?: boolean
}

export function Gallery({ activeId, onPick, disabled }: Props) {
  return (
    <div className="gallery">
      {SAMPLES.map((s) => (
        <button
          key={s.id}
          className={`sample${activeId === s.id ? ' active' : ''}`}
          onClick={() => onPick(s.id)}
          disabled={disabled}
          title={s.blurb}
        >
          <img src={sampleUrl(s.id)} alt="" loading="lazy" />
          <span>{s.label}</span>
        </button>
      ))}
    </div>
  )
}
