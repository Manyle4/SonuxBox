import type { AnalyzeResult } from '../api'
import type { Track } from '../tracks'

interface Props {
  track: Track | null
  result: AnalyzeResult
}

const pct = (x: number) => `${Math.round(x * 100)}%`

// Where the numbers come from: instrument, date, units, and what we ignored.
export function DataPanel({ track, result }: Props) {
  const ignored = [
    result.cropTop ? `the top ${pct(result.cropTop)} (logos)` : '',
    result.cropBottom ? `the bottom ${pct(result.cropBottom)} (legend and date)` : '',
  ].filter(Boolean)
  const values = track?.live
    ? `${track.measure?.label}, read from NASA's own colour table for this layer, pixel by pixel`
    : track?.measure
      ? `${track.measure.label} in ${track.measure.unit}, read off the image's colour bar`
      : track?.categories
        ? `Colour legend: ${track.categories.map((c) => c.name).join(', ')}`
        : 'Colours only: no published scale, so the music follows brightness and colour'
  return (
    <section className="datapanel" aria-labelledby="data-title">
      <h3 id="data-title">About this data</h3>
      <dl>
        {track?.data && (
          <>
            <dt>Measured by</dt>
            <dd>{track.data.from}</dd>
            <dt>When</dt>
            <dd>{track.data.when}</dd>
          </>
        )}
        <dt>Values</dt>
        <dd>{values}</dd>
        <dt>Image</dt>
        <dd>
          {result.imageWidth} × {result.imageHeight} pixels, read in {result.columns} slices
          {ignored.length ? `, ignoring ${ignored.join(' and ')}` : ''}
        </dd>
        <dt>Source</dt>
        <dd>
          {track ? (
            <a href={track.source.url} target="_blank" rel="noreferrer">{track.source.label}</a>
          ) : (
            'Your own image'
          )}
        </dd>
      </dl>
    </section>
  )
}
