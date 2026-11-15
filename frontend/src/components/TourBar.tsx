interface Props {
  step: number
  total: number
  phase: 'load' | 'talk' | 'play'
  title: string
  onSkip: () => void
  onStop: () => void
}

const PHASE = { load: 'Loading…', talk: 'Narrating…', play: 'Playing…' }

export function TourBar({ step, total, phase, title, onSkip, onStop }: Props) {
  return (
    <div className="tourbar" role="region" aria-label="Guided tour">
      <span className="tour-step">Tour {step + 1} of {total}</span>
      <strong>{title}</strong>
      <span className="tour-phase" aria-live="polite">{PHASE[phase]}</span>
      <span className="tour-actions">
        <button onClick={onSkip}>{step + 1 < total ? 'Skip' : 'Finish'}</button>
        <button onClick={onStop}>Stop tour</button>
      </span>
    </div>
  )
}
