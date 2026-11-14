// Vypíše z CHANGELOG.md sekci pro danou verzi (např. „v1.0.0“) a ověří, že sedí s package.json.
// Použití: node scripts/release-notes.mjs v1.0.0 > release-notes.md
import { readFileSync } from 'fs'

const tag = process.argv[2] ?? ''
const version = tag.replace(/^v/, '')
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'))
if (pkg.version !== version) {
  console.error(`Verze tagu (${version}) nesouhlasí s package.json (${pkg.version}).`)
  process.exit(1)
}

const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf-8')
const lines = changelog.split(/\r?\n/)
const start = lines.findIndex((l) => l.startsWith(`## [${version}]`))
if (start === -1) {
  console.error(`V CHANGELOG.md chybí sekce „## [${version}]“.`)
  process.exit(1)
}
const end = lines.findIndex((l, i) => i > start && l.startsWith('## ['))
console.log(
  lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join('\n')
    .trim()
)
