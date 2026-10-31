// The scope: what the author plans for the paper (scope.md, their words) and
// how far the manuscript has come. Words, figures, tables, references and
// open markers are counted without AI; whether the planned points are made is
// judged by a small model on request (/cowrite:scope check), logged like any AI input.

import type { EngineInterface } from 'claude-code'

import type { Count, Paper, PointStatus, ScopePoint, ScopeProgress, ScopeSection, Stage } from '../types'
import { countWords, newId } from './core'
import { appendLog } from './workspace'

type $ = EngineInterface

export const SCOPE_FILE = 'scope.md'
const CHECK_FILE = '.cowriting/scope-check.json'
/** Words on a page when the author gives pages, not words. */
export const WORDS_PER_PAGE = 300

// ------------------------------------------------------------ the plan

export type ScopePlan = {
  goal: string
  words?: number
  figures?: number
  tables?: number
  references?: number
  deadline?: string
  sections: { name: string; target?: number; stage?: Stage }[]
  points: { text: string; section?: string; isTicked: boolean }[]
}

const STAGES: Record<string, Stage> = {
  outline: 'outline', gliederung: 'outline', skizze: 'outline',
  draft: 'draft', entwurf: 'draft', rohfassung: 'draft',
  revised: 'revised', überarbeitet: 'revised', ueberarbeitet: 'revised',
  final: 'final', fertig: 'final', done: 'final',
}

/** Target keys in English and German. */
const TARGETS: Record<string, keyof ScopePlan | 'pages' | 'perPage'> = {
  words: 'words', wörter: 'words', woerter: 'words',
  pages: 'pages', seiten: 'pages',
  'words per page': 'perPage', 'wörter pro seite': 'perPage',
  figures: 'figures', abbildungen: 'figures',
  tables: 'tables', tabellen: 'tables',
  references: 'references', quellen: 'references', literatur: 'references',
  deadline: 'deadline', abgabe: 'deadline', frist: 'deadline',
}

const number = (text: string): number | undefined => {
  const match = /(\d[\d.,' ]*)/.exec(text)
  if (match === null) return undefined
  const n = Number(match[1]!.replace(/[.,' ](?=\d{3}\b)/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : undefined
}

const sectionKind = (heading: string): 'goal' | 'targets' | 'sections' | 'points' | undefined => {
  const h = heading.toLowerCase()
  if (/goal|ziel/.test(h)) return 'goal'
  if (/target|umfang|vorgabe/.test(h)) return 'targets'
  if (/section|kapitel|abschnitt|gliederung|outline/.test(h)) return 'sections'
  if (/point|kernaussage|aussage|punkt/.test(h)) return 'points'
  return undefined
}

/** scope.md as the author wrote it; comments and placeholders ignored. */
export const parseScope = (text: string): ScopePlan => {
  const plan: ScopePlan = { goal: '', sections: [], points: [] }
  let pages: number | undefined
  let perPage = WORDS_PER_PAGE
  const parts = text.replace(/<!--[\s\S]*?-->/g, '').split(/^## +(.+)$/m)
  for (let i = 1; i < parts.length; i += 2) {
    const kind = sectionKind(parts[i]!)
    const body = (parts[i + 1] ?? '').trim()
    const items = body.split('\n').map(l => l.trim()).filter(l => /^[-*+]\s/.test(l)).map(l => l.replace(/^[-*+]\s+/, ''))
    if (kind === 'goal') plan.goal = body
    if (kind === 'targets') {
      for (const item of items) {
        const [rawKey = '', ...rest] = item.split(':')
        const key = TARGETS[rawKey.trim().toLowerCase()]
        const value = rest.join(':').trim()
        if (key === undefined || value === '') continue
        if (key === 'deadline') {
          const date = /\d{4}-\d{2}-\d{2}/.exec(value)?.[0]
          if (date !== undefined) plan.deadline = date
        } else if (key === 'pages') pages = number(value)
        else if (key === 'perPage') perPage = number(value) ?? perPage
        else (plan as Record<string, unknown>)[key] = number(value)
      }
    }
    if (kind === 'sections') {
      for (const item of items) {
        const [name = '', ...rest] = item.split(':')
        const detail = rest.join(':').toLowerCase()
        const stage = Object.entries(STAGES).find(([word]) => new RegExp(`(^|[^\\p{L}])${word}([^\\p{L}]|$)`, 'u').test(detail))?.[1]
        if (name.trim() !== '') plan.sections.push({ name: name.trim(), target: number(detail), stage })
      }
    }
    if (kind === 'points') {
      for (const item of items) {
        const tick = /^\[([ xX✓])\]\s*/.exec(item)
        let text = tick ? item.slice(tick[0].length) : item
        let section: string | undefined
        const tail = /\s*\((?:→\s*|in\s+)?([^()]+)\)\s*$/.exec(text)
        if (tail !== null && plan.sections.some(s => s.name.toLowerCase() === tail[1]!.trim().toLowerCase())) {
          section = tail[1]!.trim()
          text = text.slice(0, tail.index)
        }
        if (text.trim() !== '') plan.points.push({ text: text.trim(), section, isTicked: tick !== null && tick[1] !== ' ' })
      }
    }
  }
  if (plan.words === undefined && pages !== undefined) plan.words = Math.round(pages * perPage)
  if (plan.words === undefined && plan.sections.some(s => s.target !== undefined)) {
    plan.words = plan.sections.reduce((sum, s) => sum + (s.target ?? 0), 0)
  }
  return plan
}

export const isEmptyPlan = (plan: ScopePlan): boolean =>
  plan.goal === '' && plan.points.length === 0 && plan.sections.length === 0 && plan.words === undefined

// ------------------------------------------------------------ the text

export type TextFile = { file: string; text: string; format: 'latex' | 'markdown' }

const MARKERS = /\bTODO\b|\bFIXME\b|\bXXX\b|\\todo\b|\?\?|\[citation needed\]|\bUNVERIFIED\b/g
const HEADING = { latex: /^\s*\\(?:chapter|section)\*?\{([^}]*)\}/, markdown: /^#{1,2}\s+(.+?)\s*#*$/ }

type Chunk = { heading: string; text: string; format: 'latex' | 'markdown' }

/** The text cut at its top headings (chapters and sections, # and ##). */
const chunks = (files: readonly TextFile[]): Chunk[] => {
  const out: Chunk[] = []
  for (const f of files) {
    let current: Chunk = { heading: '', text: '', format: f.format }
    out.push(current)
    for (const line of f.text.split('\n')) {
      const heading = HEADING[f.format].exec(line)
      if (heading !== null) {
        current = { heading: heading[1]!.trim(), text: '', format: f.format }
        out.push(current)
      } else current.text += `${line}\n`
    }
  }
  return out
}

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length

const citekeys = (files: readonly TextFile[]): Set<string> => {
  const keys = new Set<string>()
  for (const f of files) {
    for (const m of f.text.matchAll(/\\[A-Za-z]*cite[a-z]*\*?(?:\[[^\]]*\]){0,2}\{([^}]*)\}/g)) {
      for (const key of m[1]!.split(',')) if (key.trim() !== '') keys.add(key.trim())
    }
    if (f.format === 'markdown') for (const m of f.text.matchAll(/(?:^|[\s[;-])@([\w:.-]*\w)/g)) keys.add(m[1]!)
  }
  return keys
}

const matches = (heading: string, name: string) => {
  const h = heading.toLowerCase()
  const n = name.toLowerCase()
  return h !== '' && (h === n || h.includes(n) || n.includes(h))
}

const STAGE_VALUE: Record<Stage, number> = { outline: 0, draft: 0.4, revised: 0.75, final: 1 }
/** Each open marker in a section takes this much off its finish. */
const MARKER_COST = 0.05

const ratio = (c: Count) => (c.target === undefined ? undefined : Math.min(1, c.done / c.target))

/** How far the text has come against the plan; points as the author ticked them or the last check found. */
export const scopeProgress = (
  plan: ScopePlan,
  files: readonly TextFile[],
  checked: Record<string, { status: PointStatus; where?: string; note?: string }>,
  checkedAt: string | undefined,
  today: string,
): ScopeProgress => {
  const parts = chunks(files)
  const words = parts.reduce((sum, c) => sum + countWords(c.text, c.format), 0)
  const allText = files.map(f => f.text).join('\n')
  const sections: ScopeSection[] = plan.sections.map(s => {
    const own = parts.filter(c => matches(c.heading, s.name))
    return {
      name: s.name,
      target: s.target,
      stage: s.stage,
      words: own.reduce((sum, c) => sum + countWords(c.text, c.format), 0),
      markers: own.reduce((sum, c) => sum + count(c.text, MARKERS), 0),
      isFound: own.length > 0,
    }
  })
  const points: ScopePoint[] = plan.points.map(p => ({ ...p, ...(checked[p.text] ?? {}) }))
  const counts = {
    words: { done: words, target: plan.words },
    figures: { done: files.reduce((n, f) => n + count(f.text, f.format === 'latex' ? /\\begin\{figure\*?\}/g : /!\[[^\]]*\]\([^)]*\)/g), 0), target: plan.figures },
    tables: {
      done: files.reduce((n, f) => n + count(f.text, f.format === 'latex' ? /\\begin\{table\*?\}/g : /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/gm), 0),
      target: plan.tables,
    },
    references: { done: citekeys(files).size, target: plan.references },
  }

  // content: the points count double, each quantity once (figures, tables, references half)
  const weighted: [number | undefined, number][] = [
    [points.length > 0 ? points.reduce((sum, p) => sum + (p.isTicked || p.status === 'covered' ? 1 : p.status === 'partial' ? 0.5 : 0), 0) / points.length : undefined, 2],
    [ratio(counts.words), 1],
    [ratio(counts.figures), 0.5],
    [ratio(counts.tables), 0.5],
    [ratio(counts.references), 0.5],
  ]
  const known = weighted.filter((p): p is [number, number] => p[0] !== undefined)
  const content = known.length === 0 ? 0 : known.reduce((s, [v, w]) => s + v * w, 0) / known.reduce((s, [, w]) => s + w, 0)

  // finish: the sections' stages, weighted by their targets, less the open markers
  const staged = sections.filter(s => s.stage !== undefined)
  const finish =
    staged.length === 0
      ? null
      : staged.reduce((sum, s) => sum + Math.max(0, STAGE_VALUE[s.stage!] - s.markers * MARKER_COST) * (s.target ?? 1), 0) /
        staged.reduce((sum, s) => sum + (s.target ?? 1), 0)

  let daysLeft: number | undefined
  let wordsPerDay: number | undefined
  if (plan.deadline !== undefined) {
    daysLeft = Math.ceil((Date.parse(plan.deadline) - Date.parse(today)) / 86_400_000)
    if (plan.words !== undefined && daysLeft > 0) wordsPerDay = Math.max(0, Math.ceil((plan.words - words) / daysLeft))
  }
  return {
    goal: plan.goal,
    ...counts,
    deadline: plan.deadline,
    daysLeft,
    wordsPerDay,
    points,
    checkedAt,
    sections,
    markers: count(allText, MARKERS),
    content,
    finish,
    overall: finish === null ? content : 0.7 * content + 0.3 * finish,
  }
}

// ------------------------------------------------------------ the check

/** Manuscript lines with their numbers, file by file, cut at `maxChars`. */
export const numberedText = (files: readonly TextFile[], maxChars = 80_000): string => {
  let out = ''
  for (const f of files) {
    const block = `### ${f.file}\n${f.text.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n')}\n\n`
    if (out.length + block.length > maxChars) return `${out}${block.slice(0, Math.max(0, maxChars - out.length))}\n[… cut]`
    out += block
  }
  return out
}

export const scopeCheckSystem = (language: 'en' | 'de') =>
  [
    "You check which of an author's planned points their manuscript already makes. You never write, rephrase or suggest text:",
    'the author is the sole author (DFG good scientific practice). You only assess.',
    'For each numbered point answer: status "covered" (made and supported), "partial" (mentioned but not developed or not',
    'supported) or "missing"; where = "file:line" of the best evidence (omit if missing); note = at most 15 words on what is',
    'there or what is lacking, never wording for it.',
    `Write the notes in ${language === 'de' ? 'German' : 'English'}.`,
    'Answer with a JSON array only: [{"n": 1, "status": "partial", "where": "manuscript/main.tex:42", "note": "…"}].',
  ].join(' ')

export const parseCheck = (text: string, count: number): { n: number; status: PointStatus; where?: string; note?: string }[] => {
  const json = /\[[\s\S]*\]/.exec(text)?.[0]
  if (json === undefined) return []
  try {
    const items = JSON.parse(json) as unknown[]
    return items.flatMap(item => {
      const o = item as Record<string, unknown>
      const n = Number(o.n)
      const status = o.status
      if (!Number.isInteger(n) || n < 1 || n > count) return []
      if (status !== 'covered' && status !== 'partial' && status !== 'missing') return []
      return [{
        n,
        status,
        ...(typeof o.where === 'string' && o.where !== '' ? { where: o.where } : {}),
        ...(typeof o.note === 'string' && o.note !== '' ? { note: o.note.slice(0, 160) } : {}),
      }]
    })
  } catch {
    return []
  }
}

type CheckFile = { ts: string; model: string; points: Record<string, { status: PointStatus; where?: string; note?: string }> }

const join = (...parts: string[]) => parts.join('/').replace(/\/+/g, '/')

export async function readCheck($: $, root: string): Promise<CheckFile | undefined> {
  try {
    const path = join(root, CHECK_FILE)
    return (await $.fs.exists(path)) ? (JSON.parse(await $.fs.read(path)) as CheckFile) : undefined
  } catch {
    return undefined
  }
}

const TEXT_FILE = /\.(tex|md|markdown|qmd|rmd)$/i

export async function readTextFiles($: $, paper: Paper): Promise<TextFile[]> {
  const out: TextFile[] = []
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 4 || !(await $.fs.exists(dir))) return
    for (const entry of await $.fs.list(dir)) {
      const path = join(dir, entry.name)
      if (entry.kind === 'dir') await walk(path, depth + 1)
      else if (entry.kind === 'file' && TEXT_FILE.test(entry.name)) {
        out.push({ file: path.slice(paper.root.length + 1), text: await $.fs.read(path), format: entry.name.toLowerCase().endsWith('.tex') ? 'latex' : 'markdown' })
      }
    }
  }
  await walk(join(paper.root, 'manuscript'), 0)
  return out.sort((a, b) => a.file.localeCompare(b.file))
}

export async function readPlan($: $, root: string): Promise<ScopePlan | null> {
  const path = join(root, SCOPE_FILE)
  if (!(await $.fs.exists(path))) return null
  const plan = parseScope(await $.fs.read(path))
  return isEmptyPlan(plan) ? null : plan
}

/** The scope's progress now, or null when the author has not set one. */
export async function measureScope($: $, paper: Paper, today: string): Promise<ScopeProgress | null> {
  const plan = await readPlan($, paper.root)
  if (plan === null) return null
  const check = await readCheck($, paper.root)
  return scopeProgress(plan, await readTextFiles($, paper), check?.points ?? {}, check?.ts, today)
}

/** /cowrite:scope check: which points the text makes. Logged; resolves a one-line summary. */
export async function checkPoints($: $, paper: Paper, model: string): Promise<string> {
  const plan = await readPlan($, paper.root)
  if (plan === null || plan.points.length === 0) return 'No points in scope.md yet: add them under "## Points", or run /cowrite:scope edit.'
  const files = await readTextFiles($, paper)
  if (files.every(f => f.text.trim() === '')) return 'The manuscript is still empty: nothing to check yet.'
  const list = plan.points.map((p, i) => `${i + 1}. ${p.text}${p.section ? ` (planned for: ${p.section})` : ''}`).join('\n')
  const prompt = `Planned points:\n${list}\n\nGoal of the paper: ${plan.goal || '(not given)'}\n\nManuscript:\n${numberedText(files)}`
  const answer = await $.model.complete({
    model,
    system: scopeCheckSystem(paper.language),
    prompt,
    maxTokens: 1500,
    effort: 'low',
    timeoutMs: 120_000,
  })
  if (!answer.isAnswered) return 'The point check failed; try again later.'
  const results = parseCheck(answer.text, plan.points.length)

  const id = newId()
  const ts = new Date(await $.clock.now()).toISOString()
  await appendLog($, paper.root, {
    type: 'prompt',
    id,
    ts,
    session: await $.session.id(),
    paper: paper.name,
    category: 'structure',
    origin: 'scope',
    text: `Scope check: which of ${plan.points.length} planned points the manuscript makes`,
  })
  await appendLog($, paper.root, {
    type: 'response',
    ref: id,
    ts,
    model,
    personas: [],
    tools_used: [],
    ai_text_flag: false,
    answer: results.map(r => `${r.n}. ${r.status}${r.where ? ` @ ${r.where}` : ''}${r.note ? `: ${r.note}` : ''}`).join('\n') || '(no result)',
  })

  const points: CheckFile['points'] = {}
  for (const r of results) points[plan.points[r.n - 1]!.text] = { status: r.status, where: r.where, note: r.note }
  await $.fs.write(join(paper.root, CHECK_FILE), `${JSON.stringify({ ts, model, points } satisfies CheckFile, null, 2)}\n`)
  const covered = results.filter(r => r.status === 'covered').length
  const partial = results.filter(r => r.status === 'partial').length
  return `🎯 Points: ${covered} covered, ${partial} partial, ${plan.points.length - covered - partial} missing · details in the Scope tab (/cowrite:pane scope)`
}
