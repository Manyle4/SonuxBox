// After `vite build`: lists every file the offline cache should hold (dist/offline.json)
// and stamps a version into dist/sw.js, so each deploy refreshes the cache.
import { createHash } from 'node:crypto'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const dist = new URL('../dist/', import.meta.url).pathname
const skip = new Set(['sw.js', 'offline.json', 'index.html', 'og.jpg', 'robots.txt']) // only for link previews and crawlers

async function walk(dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(p)))
    else out.push(p)
  }
  return out
}

const files = (await walk(dist)).map((p) => '/' + relative(dist, p)).filter((f) => !skip.has(f.slice(1))).sort()
const hash = createHash('sha256')
for (const f of files) hash.update(f + (await stat(join(dist, f))).size)
const version = hash.digest('hex').slice(0, 12)

await writeFile(join(dist, 'offline.json'), JSON.stringify({ version, files }))
const sw = join(dist, 'sw.js')
await writeFile(sw, (await readFile(sw, 'utf8')).replace('__VERSION__', version))
console.log(`offline cache: ${files.length} files, version ${version}`)
