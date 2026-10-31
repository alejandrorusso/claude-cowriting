// Reading and writing the paper workspace through `$.fs`. A workspace is a
// folder holding paper.json, or a folder whose .active-project names one of
// its projects/<name>/ papers. /cw:paper <path> can also point the session at
// a paper folder anywhere, so Claude Code can run from any folder.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { GameFile, LogEntry, Paper } from '../types'
import { BRIEF_FILE, NEW_GAME, countWords, monthFile, parseBriefs, parseLog, setBrief } from './core'
import type { Fingerprint } from './core'

type $ = EngineInterface

const join = (...parts: string[]) => parts.join('/').replace(/\/+/g, '/')

async function readJson<T>($: $, path: string): Promise<T | undefined> {
  try {
    if (!(await $.fs.exists(path))) return undefined
    return JSON.parse(await $.fs.read(path)) as T
  } catch {
    return undefined
  }
}

type PaperJson = Partial<Pick<Paper, 'name' | 'format' | 'language' | 'domainPack' | 'autosave'>>

const asPaper = (root: string, json: PaperJson, fallbackPack: string): Paper => ({
  root,
  name: json.name ?? root.split('/').pop() ?? 'paper',
  format: json.format === 'latex' ? 'latex' : 'markdown',
  language: json.language === 'de' ? 'de' : 'en',
  domainPack: json.domainPack ?? fallbackPack,
  autosave: json.autosave !== false,
})

/** A paper folder chosen with /cw:paper <path>; null: the session's folder decides. */
const paperRootAtom = atom({ plugin: 'cw', key: 'paperRoot' } as const, null as string | null)

const RECENT_KEY = 'recentPapers'
const KEEP_RECENT = 8

/** The paper the session works on, or null outside a CoWriting workspace. */
export async function findPaper($: $, fallbackPack: string): Promise<Paper | null> {
  const chosen = await read($, paperRootAtom)
  if (chosen !== null) {
    const json = await readJson<PaperJson>($, join(chosen, 'paper.json'))
    if (json !== undefined) return asPaper(chosen, json, fallbackPack)
  }
  const cwd = await $.session.cwd()
  const here = await readJson<PaperJson>($, join(cwd, 'paper.json'))
  if (here !== undefined) return asPaper(cwd, here, fallbackPack)

  const marker = join(cwd, '.active-project')
  if (await $.fs.exists(marker)) {
    const name = (await $.fs.read(marker)).trim()
    const root = join(cwd, 'projects', name)
    const json = await readJson<PaperJson>($, join(root, 'paper.json'))
    if (json !== undefined) return asPaper(root, json, fallbackPack)
  }
  return null
}

export async function readLog($: $, root: string): Promise<LogEntry[]> {
  const dir = join(root, 'ai-log')
  if (!(await $.fs.exists(dir))) return []
  const files = (await $.fs.list(dir))
    .filter(f => f.kind === 'file' && f.name.endsWith('.jsonl'))
    .map(f => f.name)
    .sort()
  const entries: LogEntry[] = []
  for (const name of files) entries.push(...parseLog(await $.fs.read(join(dir, name))))
  return entries
}

// The versions every response entry names, set once the session knows them.
let versions: { plugin?: string; claude_code?: string } = {}
export const setLogVersions = (v: { plugin?: string; claude_code?: string }) => {
  versions = { ...v }
}

// One writer at a time per paper: the log is appended by reading and rewriting the month's
// file (the engine's fs has no append), so two appends in flight would lose one.
const queues = new Map<string, Promise<unknown>>()

/** Runs `fn` after every earlier log write of this paper has finished, before any later one. */
export function withLog<T>(root: string, fn: () => Promise<T>): Promise<T> {
  const previous = queues.get(root) ?? Promise.resolve()
  const run = previous.then(fn, fn)
  queues.set(root, run.catch(() => undefined))
  return run
}

/** Append one entry to this month's log file (append-only by content). */
export function appendLog($: $, root: string, entry: LogEntry): Promise<void> {
  const stamped = entry.type === 'response' ? { ...entry, ...versions } : entry
  return withLog(root, async () => {
    const path = join(root, 'ai-log', monthFile(new Date()))
    const before = (await $.fs.exists(path)) ? await $.fs.read(path) : ''
    const sep = before === '' || before.endsWith('\n') ? '' : '\n'
    await $.fs.write(path, `${before}${sep}${JSON.stringify(stamped)}\n`)
  })
}

const MANUSCRIPT_FILE = /\.(tex|md|markdown|qmd|rmd)$/i

/** Every file under the paper's manuscript folder, a few levels deep. */
export async function listManuscriptFiles($: $, dir: string, depth = 0): Promise<string[]> {
  if (depth > 4 || !(await $.fs.exists(dir))) return []
  const out: string[] = []
  for (const entry of await $.fs.list(dir)) {
    const path = join(dir, entry.name)
    if (entry.kind === 'dir') out.push(...(await listManuscriptFiles($, path, depth + 1)))
    else if (entry.kind === 'file') out.push(path)
  }
  return out
}

/** The manuscript's files as they are now: relative path → `mtime:size`. */
export async function fingerprintManuscript($: $, paper: Paper): Promise<Fingerprint> {
  const dir = join(paper.root, 'manuscript')
  const out: Record<string, string> = {}
  for (const path of await listManuscriptFiles($, dir)) {
    const stat = await $.fs.stat(path).catch(() => null)
    if (stat !== null) out[path.slice(paper.root.length + 1)] = `${stat.mtimeMs}:${stat.size}`
  }
  return out
}

async function wordsUnder($: $, dir: string, depth: number): Promise<number> {
  if (depth > 4 || !(await $.fs.exists(dir))) return 0
  let total = 0
  for (const entry of await $.fs.list(dir)) {
    const path = join(dir, entry.name)
    if (entry.kind === 'dir') total += await wordsUnder($, path, depth + 1)
    else if (entry.kind === 'file' && MANUSCRIPT_FILE.test(entry.name)) {
      const format = entry.name.toLowerCase().endsWith('.tex') ? 'latex' : 'markdown'
      total += countWords(await $.fs.read(path), format)
    }
  }
  return total
}

export async function manuscriptWords($: $, paper: Paper): Promise<number> {
  return wordsUnder($, join(paper.root, 'manuscript'), 0)
}

const gamePath = (root: string) => join(root, '.cowriting', 'game.json')

export async function readGame($: $, root: string): Promise<GameFile> {
  const game = await readJson<GameFile>($, gamePath(root))
  return game?.version === 1 ? { ...NEW_GAME, ...game } : NEW_GAME
}

export async function writeGame($: $, root: string, game: GameFile): Promise<void> {
  await $.fs.write(gamePath(root), `${JSON.stringify(game, null, 2)}\n`)
}

/** Counts the tools write: verified references and generated disclosures. */
export async function readToolCounts($: $, root: string) {
  const verify = await readJson<{ ok?: number }>($, join(root, 'literature', '.verify.json'))
  const disclosureDir = join(root, 'disclosure')
  const disclosures = (await $.fs.exists(disclosureDir))
    ? (await $.fs.list(disclosureDir)).filter(f => f.name.startsWith('ai-register')).length
    : 0
  return { verifiedRefs: verify?.ok ?? 0, disclosures }
}

export async function setActiveProject($: $, name: string): Promise<string> {
  const cwd = await $.session.cwd()
  const root = join(cwd, 'projects', name)
  if (!(await $.fs.exists(join(root, 'paper.json')))) {
    return `No paper "${name}" under projects/. Create one with /cw:init.`
  }
  await $.fs.write(join(cwd, '.active-project'), `${name}\n`)
  await update($, paperRootAtom, () => null)
  return `Active paper: ${name}`
}

/** Papers opened by path before, newest first (kept across sessions). */
export async function recentPapers($: $): Promise<string[]> {
  const value = await $.store.get(RECENT_KEY).catch(() => undefined)
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/** `~/x`, `x` (relative to the session's folder) or `/x`, without a trailing slash. */
async function absolutePath($: $, arg: string): Promise<string> {
  const raw = arg.trim().replace(/^(['"])(.*)\1$/, '$2')
  if (raw === '~' || raw.startsWith('~/')) return join((await $.env.get('HOME')) ?? '', raw.slice(1)).replace(/(.)\/$/, '$1')
  const path = raw.startsWith('/') ? raw : join(await $.session.cwd(), raw)
  return path.replace(/(.)\/$/, '$1')
}

async function kindOf($: $, path: string): Promise<'file' | 'dir' | 'other' | 'none'> {
  return $.fs.stat(path).then(s => s.kind, () => 'none' as const)
}

/**
 * /cw:paper <arg>: a number picks a recent paper, a bare name one under
 * projects/, anything else is a path to a paper folder (or a file in it).
 */
export async function openPaper($: $, arg: string): Promise<string> {
  const recent = await recentPapers($)
  if (/^\d+$/.test(arg)) {
    const pick = recent[Number(arg) - 1]
    if (pick === undefined) return `No recent paper #${arg}. /cw:paper lists them.`
    arg = pick
  }
  const isName = !/[\/~]/.test(arg) && arg !== '.' && arg !== '..'
  if (isName && (await $.fs.exists(join(await $.session.cwd(), 'projects', arg, 'paper.json')))) {
    return setActiveProject($, arg)
  }
  let root = await absolutePath($, arg)
  const kind = await kindOf($, root)
  if (kind === 'none' || kind === 'other') return `No folder ${root}.`
  if (kind === 'file') root = root.replace(/\/[^/]+$/, '') || '/'
  const json = await readJson<PaperJson>($, join(root, 'paper.json'))
  if (json === undefined) {
    return `${root} is not a CoWriting paper yet. Set it up there with /cw:init ${root}`
  }
  await update($, paperRootAtom, () => root)
  await $.store.set(RECENT_KEY, [root, ...recent.filter(r => r !== root)].slice(0, KEEP_RECENT)).catch(() => undefined)
  return `Active paper: ${json.name ?? root.split('/').pop()} · ${root}`
}

/**
 * /cw:init <path>: the session works on that folder from now on, so the
 * workspace the skill scaffolds there is the active paper once it exists.
 */
export async function targetFolder($: $, arg: string): Promise<string | null> {
  const root = await absolutePath($, arg)
  if ((await kindOf($, root)) !== 'dir') return null
  await update($, paperRootAtom, () => root)
  const recent = await recentPapers($)
  await $.store.set(RECENT_KEY, [root, ...recent.filter(r => r !== root)].slice(0, KEEP_RECENT)).catch(() => undefined)
  return root
}

/** /cw:paper without arguments: the active paper and the recent ones. */
export async function describePapers($: $, fallbackPack: string): Promise<string> {
  const paper = await findPaper($, fallbackPack)
  const recent = await recentPapers($)
  const lines = [paper === null ? 'No active paper.' : `Active paper: ${paper.name} · ${paper.root}`]
  if (recent.length > 0) lines.push('Recent:', ...recent.map((r, i) => `  ${i + 1}  ${r}`))
  lines.push('Switch with /cw:paper <path | number | project name>.')
  return lines.join('\n')
}

export async function readBriefs($: $, root: string): Promise<Record<string, string>> {
  const path = join(root, BRIEF_FILE)
  if (!(await $.fs.exists(path))) return {}
  return parseBriefs(await $.fs.read(path))
}

/** Sets one section of party.md, creating the file when the paper has none. */
export async function writeBrief($: $, root: string, key: string, body: string): Promise<void> {
  const path = join(root, BRIEF_FILE)
  const before = (await $.fs.exists(path)) ? await $.fs.read(path) : '# Briefing for the review party\n'
  await $.fs.write(path, setBrief(before, key, body))
}
