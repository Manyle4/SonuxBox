// Prints {key: text} for every track's narration as JSON (built and run by `npm run narration`).
import { readFileSync } from 'node:fs'
import type { AnalysisMode, AnalyzeResult } from '../src/api'
import { allNarrations } from '../src/narration'
import { TRACKS } from '../src/tracks'

const load = (id: string, mode: AnalysisMode) =>
  JSON.parse(readFileSync(new URL(`../public/tracks/${id}.${mode}.json`, import.meta.url), 'utf8')) as AnalyzeResult

process.stdout.write(JSON.stringify(allNarrations(load, TRACKS), null, 2))
