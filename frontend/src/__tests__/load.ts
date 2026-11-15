import { readFileSync } from 'node:fs'
import type { AnalyzeResult } from '../api'

// A pre-rendered result from public/tracks, as the site would load it.
export const load = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../public/tracks/${name}.json`, import.meta.url), 'utf8')) as AnalyzeResult
