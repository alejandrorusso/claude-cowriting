// Pure logic shared by the hooks: the provenance log's shape, the stats the
// pane shows, the manuscript guard's decision, word counting and the game.
// Nothing here touches `$`, so tests can run it directly.

import type {
  RateWindow,
  Usage,
  Achievement,
  AnnotationEntry,
  GameFile,
  LogEntry,
  Progress,
  PromptEntry,
  RecentTurn,
  ResponseEntry,
  Stats,
} from '../types'
import { PERSONAS, personaById } from './personas'
import type { Persona } from './personas'

// ---------------------------------------------------------------- the log





export const AI_TEXT_MARKER = '[AI-TEXT]'

/** Skills that only manage the log or workspace; their turns need no annotation. */
const META_COMMANDS = new Set(['annotate', 'disclosure', 'init', 'pane', 'paper', 'brief', 'watch', 'quiet', 'scope'])

const COMMAND_CATEGORY: Readonly<Record<string, string>> = {
  feedback: 'feedback',
  socratic: 'feedback',
  structure: 'structure',
  language: 'language',
  sources: 'literature',
  explain: 'concepts',
  consistency: 'structure',
}

const bare = (name: string) => name.replace(/^cw:/, '')

export const categoryFor = (command: string | undefined, text: string): string => {
  if (command !== undefined) {
    const name = bare(command)
    if (META_COMMANDS.has(name)) return 'meta'
    if (name === 'summon' || name === 'ask') {
      const persona = personaById(text.trim().split(/\s+/)[0] ?? '')
      return persona?.category ?? 'feedback'
    }
    return COMMAND_CATEGORY[name] ?? 'general'
  }
  const summoned = /cw:([a-z0-9-]+) agent/.exec(text)
  if (summoned) return personaById(summoned[1]!)?.category ?? 'general'
  return 'general'
}

export const parseLog = (text: string): LogEntry[] => {
  const out: LogEntry[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    try {
      const value = JSON.parse(trimmed) as LogEntry
      if (value && typeof value === 'object' && 'type' in value) out.push(value)
    } catch {
      // A torn line is skipped, never fatal.
    }
  }
  return out
}

export const monthFile = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}.jsonl`

// -------------------------------------------------------------- the stats



export const EMPTY_STATS: Stats = {
  turns: 0,
  today: 0,
  unannotated: 0,
  aiText: 0,
  byCategory: {},
  personaConsults: {},
  personaAdopted: {},
  annotations: 0,
  recent: [],
  open: [],
}

/** The subagent id a hand-back prompt reports for, from `<agent-message from="…">`. */
export const handBackAgentId = (text: string): string | undefined =>
  /^\s*<agent-message from="([^"]+)"/.exec(text)?.[1]

/** Which persona a subagent was launched as, from the log's response entries. */
export const personaForAgent = (entries: readonly LogEntry[], agentId: string): string | undefined => {
  for (const e of entries) {
    if (e.type === 'response' && e.agents?.[agentId] !== undefined) return e.agents[agentId]
  }
  return undefined
}

/** Markdown, tags and frames out: a line a person can read in a card. */
const flatten = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[Subagent hand-back\][^.]*\./g, ' ')
    .replace(/[#*_`>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** What the four classifications mean, in the words the buttons and the legend use. */
export const USE_LABELS = {
  adopted: { button: '✓ used', meaning: 'taken over as suggested' },
  adapted: { button: '✎ changed', meaning: 'used in your own way' },
  rejected: { button: '✗ not used', meaning: 'you decided against it' },
  info: { button: 'ℹ info', meaning: 'it only informed you' },
} as const

export const computeStats = (entries: readonly LogEntry[], now: Date): Stats => {
  const prompts = new Map<string, PromptEntry>()
  const responses = new Map<string, ResponseEntry>()
  const annotated = new Map<string, AnnotationEntry>()
  for (const e of entries) {
    if (e.type === 'prompt') prompts.set(e.id, e)
    else if (e.type === 'response') responses.set(e.ref, e)
    else annotated.set(e.ref, e)
  }

  const day = now.toISOString().slice(0, 10)
  const stats: Stats = { ...EMPTY_STATS, byCategory: {}, personaConsults: {}, personaAdopted: {}, recent: [], open: [] }
  const turns: RecentTurn[] = []

  for (const [id, p] of prompts) {
    if (p.category === 'meta') continue
    const r = responses.get(id)
    if (r === undefined) continue
    const a = annotated.get(id)
    const category = a?.category ?? p.category
    stats.turns += 1
    if (p.ts.startsWith(day)) stats.today += 1
    stats.byCategory[category] = (stats.byCategory[category] ?? 0) + 1
    // Live hints come in a steady stream, and a turn that only launched a reviewer has nothing to
    // classify: its report does. Classifying those is welcome, not owed.
    const isLaunchOnly = r.agents !== undefined && Object.keys(r.agents).length > 0
    const isOpen = a === undefined && p.origin !== 'watch' && p.origin !== 'scope' && !isLaunchOnly
    if (isOpen) stats.unannotated += 1
    if (r.ai_text_flag) stats.aiText += 1
    for (const persona of r.personas) {
      // a consult is counted when the persona is launched; its hand-back only carries the annotation,
      // and live hints are not consults the author asked for
      if (p.origin === undefined) stats.personaConsults[persona] = (stats.personaConsults[persona] ?? 0) + 1
      if (a?.use === 'adopted' || a?.use === 'adapted') {
        stats.personaAdopted[persona] = (stats.personaAdopted[persona] ?? 0) + 1
      }
    }
    turns.push({
      id,
      ts: p.ts,
      category,
      preview:
        p.origin === 'agent'
          ? `↩ report from ${personaById(p.agent ?? '')?.name ?? 'a subagent'}`
          : p.text.replace(/\s+/g, ' ').slice(0, 60),
      answer: flatten(r.answer).slice(0, 240),
      ...(p.agent !== undefined || r.personas[0] !== undefined ? { persona: p.agent ?? r.personas[0] } : {}),
      ...(p.origin !== undefined ? { origin: p.origin } : {}),
      isOpen,
      personas: r.personas,
      isAnnotated: a !== undefined,
      isAiText: r.ai_text_flag,
    })
  }
  stats.annotations = annotated.size
  stats.recent = turns.slice(-6).reverse()
  stats.open = turns.filter(t => t.isOpen).slice(-5).reverse()
  return stats
}

// -------------------------------------------------------------- the guard

const WRITE_PATTERNS = [
  />>?/,
  /\btee\b/,
  /\bsed\s+(-[a-zA-Z]*i|--in-place)/,
  /\bperl\s+-[a-zA-Z]*i/,
  /\b(mv|cp|rm|rmdir|truncate|touch|ln|dd|install|rsync)\b/,
  /\bgit\s+(checkout|restore|reset|apply|stash|mv|rm|clean)\b/,
  /\bopen\([^)]*['"][wa+]/,
  /\b(write_text|writeFile|write_bytes)\b/,
  /\bpandoc\b.*\s-o\s/,
]

/** Does this path lie in a `manuscript` folder? */
export const isManuscriptPath = (path: string): boolean =>
  /(^|[\\/])manuscript([\\/]|$)/.test(path)

/** Would this shell command change a file in a `manuscript` folder? */
export const bashTouchesManuscript = (command: string): boolean =>
  /(^|[\s'"=\\/])manuscript([\\/\s'"]|$)/.test(command) &&
  WRITE_PATTERNS.some(p => p.test(command))

export const GUARD_MESSAGE =
  'CoWriting: the manuscript/ folder is written by its human author only (DFG good scientific practice: ' +
  'only natural persons are authors). Give located feedback, questions or corrected example sentences in the chat instead; ' +
  'the author decides what goes into the text.'

// ------------------------------------------------------------- the words

export const countWords = (text: string, format: 'latex' | 'markdown'): number => {
  let t = text
  if (format === 'latex') {
    t = t
      .replace(/(^|[^\\])%.*$/gm, '$1')
      .replace(/\\begin\{(figure|table|equation|align)\*?\}[\s\S]*?\\end\{\1\*?\}/g, ' ')
      .replace(/\\([A-Za-z]*cite[a-z]*|ref|label|eqref|autoref|cref|input|include|usepackage|documentclass|bibliography|addbibresource)\*?(\[[^\]]*\])*\{[^}]*\}/g, ' ')
      .replace(/\\[a-zA-Z]+\*?/g, ' ')
      .replace(/[{}$\\]/g, ' ')
  } else {
    t = t
      .replace(/^---\n[\s\S]*?\n---\n/, ' ')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/\[@[^\]]*\]/g, ' ')
      .replace(/[#*_>`|~-]/g, ' ')
  }
  return t.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length
}

// -------------------------------------------------------------- the game


export const NEW_GAME: GameFile = {
  version: 1,
  baselineWords: null,
  maxWords: 0,
  writingDays: [],
  achievements: [],
  disclosures: 0,
  verifiedRefs: 0,
}


export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first-1000', title: 'First 1,000 own words', detail: 'Write 1,000 words yourself' },
  { id: 'ten-k', title: 'Ten Thousand', detail: 'Write 10,000 words yourself' },
  { id: 'streak-7', title: 'Seven-day streak', detail: 'Write on 7 days in a row' },
  { id: 'clean-record', title: 'Clean Record', detail: '10+ AI turns, every one annotated' },
  { id: 'citation-hunter', title: 'Citation Hunter', detail: '20+ references verified by DOI' },
  { id: 'survived-r2', title: 'Survived Reviewer #2', detail: 'Act on 3 hints of Reviewer #2' },
  { id: 'full-party', title: 'Full Party', detail: 'Consult every core persona once' },
  { id: 'transparent', title: 'Transparent Scholar', detail: 'Generate your AI disclosure' },
]


export const levelFor = (xp: number) => Math.floor(Math.sqrt(xp / 25)) + 1
export const xpForLevel = (level: number) => (level - 1) ** 2 * 25

export const streakOf = (days: readonly string[], today: string): number => {
  const set = new Set(days)
  let streak = 0
  const d = new Date(`${today}T00:00:00Z`)
  if (!set.has(today)) d.setUTCDate(d.getUTCDate() - 1)
  while (set.has(d.toISOString().slice(0, 10))) {
    streak += 1
    d.setUTCDate(d.getUTCDate() - 1)
  }
  return streak
}

/**
 * Advance the game by what is observed now. Only growth of the manuscript
 * above its highest count so far earns writer XP, so deleting and retyping
 * earns nothing; AI turns themselves earn nothing.
 */
export const advanceGame = (
  previous: GameFile,
  words: number,
  stats: Stats,
  today: string,
): Progress => {
  const game: GameFile = { ...previous, writingDays: [...previous.writingDays], achievements: [...previous.achievements] }
  if (game.baselineWords === null) {
    game.baselineWords = words
    game.maxWords = words
  } else if (words > game.maxWords) {
    game.maxWords = words
    if (!game.writingDays.includes(today)) game.writingDays.push(today)
  }
  game.writingDays = game.writingDays.slice(-400)

  const ownWords = game.maxWords - (game.baselineWords ?? 0)
  const writerXp = Math.floor(ownWords / 10)
  const integrityXp = stats.annotations * 5 + game.verifiedRefs * 2 + game.disclosures * 20
  const xp = writerXp + integrityXp
  const level = levelFor(xp)
  const streak = streakOf(game.writingDays, today)

  const personaLevels: Record<string, number> = {}
  for (const p of PERSONAS) personaLevels[p.id] = levelFor((stats.personaAdopted[p.id] ?? 0) * 25)

  const earned: Record<string, boolean> = {
    'first-1000': ownWords >= 1000,
    'ten-k': ownWords >= 10000,
    'streak-7': streak >= 7,
    'clean-record': stats.turns >= 10 && stats.unannotated === 0,
    'citation-hunter': game.verifiedRefs >= 20,
    'survived-r2': (stats.personaAdopted['reviewer-2'] ?? 0) >= 3,
    'full-party': PERSONAS.filter(p => p.pack === 'core').every(p => (stats.personaConsults[p.id] ?? 0) > 0),
    transparent: game.disclosures > 0,
  }
  const unlocked = ACHIEVEMENTS.filter(a => earned[a.id] && !game.achievements.includes(a.id))
  for (const a of unlocked) game.achievements.push(a.id)

  return {
    ownWords,
    writerXp,
    integrityXp,
    xp,
    level,
    nextLevelXp: xpForLevel(level + 1),
    streak,
    personaLevels,
    game,
    unlocked,
  }
}

/** A gentle nudge when the help starts to outweigh the writing. */
export const overrelianceNudge = (stats: Stats): string | undefined => {
  if (stats.aiText >= 3) {
    return `${stats.aiText} answers contained AI-written text. Disclose them, and try writing the next passage yourself first.`
  }
  const consults = Object.entries(stats.personaConsults)
  const total = consults.reduce((n, [, c]) => n + c, 0)
  const top = consults.sort((a, b) => b[1] - a[1])[0]
  if (top !== undefined && total >= 6 && top[1] / total > 0.5) {
    const name = personaById(top[0])?.name ?? top[0]
    return `Most consultations go to ${name}. Other perspectives may see what this one misses.`
  }
  return undefined
}

export const newId = (): string => {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

// ------------------------------------------------------------ live review

/** Who watches by default: the perspectives that make sense sentence by sentence. */
export const WATCH_DEFAULT: readonly string[] = ['grammar-guy', 'terminologist', 'style-coach', 'architect']

export type Paragraph = { start: number; end: number; text: string }

/** Paragraphs (runs of non-blank lines) with 1-based line numbers. */
export const paragraphs = (text: string): Paragraph[] => {
  const out: Paragraph[] = []
  const lines = text.split('\n')
  let start = -1
  for (let i = 0; i <= lines.length; i++) {
    const isBlank = i === lines.length || lines[i]!.trim() === ''
    if (!isBlank && start < 0) start = i
    if (isBlank && start >= 0) {
      out.push({ start: start + 1, end: i, text: lines.slice(start, i).join('\n') })
      start = -1
    }
  }
  return out
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

/** The paragraphs of `after` that are new or changed since `before`, with some prose in them. */
export const changedParagraphs = (before: string, after: string, format: 'latex' | 'markdown'): Paragraph[] => {
  const known = new Set(paragraphs(before).map(p => squash(p.text)))
  return paragraphs(after).filter(p => !known.has(squash(p.text)) && countWords(p.text, format) >= 4)
}

/** The changed paragraphs as the live reviewer sees them: file, then numbered lines. */
export const watchExcerpt = (parts: readonly { file: string; changed: readonly Paragraph[] }[], maxChars = 4000): string => {
  let out = ''
  for (const { file, changed } of parts) {
    out += `### ${file}\n`
    for (const p of changed) {
      const numbered = p.text.split('\n').map((line, i) => `${p.start + i}| ${line}`).join('\n')
      if (out.length + numbered.length > maxChars) return `${out}[… more changes not shown]\n`
      out += `${numbered}\n\n`
    }
  }
  return out
}

export const watchSystem = (
  personas: readonly Persona[],
  language: 'en' | 'de',
  styleProfile: string,
  briefs: Readonly<Record<string, string>> = {},
): string =>
  [
    'You are the live review party of CoWriting, watching a researcher write. The researcher is the sole author (DFG good scientific practice).',
    'You see only the paragraphs they just wrote or changed, with line numbers. Give at most 3 short hints in total, only where it matters. An empty list is a good answer.',
    'Each hint: at most 25 words, about one line, from exactly one of these personas:',
    ...personas.map(p => `- ${p.id}: ${p.role}${briefs[p.id] ? `. The author asks it to look for: ${briefs[p.id]!.replace(/\s+/g, ' ')}` : ''}`),
    briefs.everyone ? `About the project, from the author: ${briefs.everyone.replace(/\s+/g, ' ')}` : '',
    'Never write or rewrite sentences for the manuscript: name the problem and the principle, or ask a question.',
    'Exceptions: grammar-guy may give the corrected form of a wrong word or phrase; terminologist may name the usual term of the field, without a sentence around it.',
    'Never invent facts or references.',
    `Write the hints in ${language === 'de' ? 'German' : 'English'}.`,
    styleProfile !== '' ? `The author's style profile, from model papers they like:\n${styleProfile}` : '',
    'Answer with JSON only: [{"persona": "<id>", "line": <number>, "hint": "<text>"}]',
  ]
    .filter(Boolean)
    .join('\n')

export type ParsedHint = { persona: string; line: number; hint: string }

/** The hints in a live-review answer: at most three, from the personas that watch. */
export const parseHints = (text: string, personas: readonly string[]): ParsedHint[] => {
  const from = text.indexOf('[')
  const to = text.lastIndexOf(']')
  if (from < 0 || to <= from) return []
  let value: unknown
  try {
    value = JSON.parse(text.slice(from, to + 1))
  } catch {
    return []
  }
  if (!Array.isArray(value)) return []
  const out: ParsedHint[] = []
  for (const item of value as Record<string, unknown>[]) {
    const persona = typeof item?.persona === 'string' ? item.persona.replace(/^cw:/, '') : ''
    const hint = typeof item?.hint === 'string' ? squash(item.hint) : ''
    if (!personas.includes(persona) || hint === '') continue
    out.push({ persona, line: Number(item.line) || 0, hint: hint.slice(0, 240) })
  }
  return out.slice(0, 3)
}

// ------------------------------------------------------------------ usage

export const EMPTY_USAGE: Usage = { contextTokens: null, contextPercent: null, costUsd: null, limits: [] }

type MeasuredUsage = {
  context: { tokens?: number; percent?: number }
  rateLimits: readonly RateWindow[]
  cost?: { usd: number }
}

export const toUsage = (u: MeasuredUsage): Usage => ({
  contextTokens: u.context.tokens ?? null,
  contextPercent: u.context.percent ?? null,
  costUsd: u.cost?.usd ?? null,
  limits: u.rateLimits.map(w => ({ kind: w.kind, percentUsed: w.percentUsed, ...(w.resetsAt ? { resetsAt: w.resetsAt } : {}) })),
})

export const formatTokens = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)

const limitName = (kind: string) => (kind === 'five_hour' ? '5h' : kind === 'seven_day' ? '7d' : kind.replace(/_/g, ' '))

const resetLabel = (w: RateWindow) => {
  if (w.resetsAt === undefined) return ''
  const d = new Date(w.resetsAt)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return w.kind === 'seven_day' ? `${d.getDate()}.${d.getMonth() + 1}. ${hm}` : hm
}

export type UsageMeter = 'off' | 'tokens' | 'tokens+limits'

/** The usage line's parts: context, live-review tokens, then the limit windows (Pro/Max) or the cost. */
export const usageParts = (u: Usage, meter: UsageMeter, liveTokens: number): string[] => {
  if (meter === 'off') return []
  const parts: string[] = []
  if (u.contextTokens !== null) {
    parts.push(`context ${formatTokens(u.contextTokens)}${u.contextPercent !== null ? ` (${Math.round(u.contextPercent)}%)` : ''}`)
  }
  if (liveTokens > 0) parts.push(`live review ${formatTokens(liveTokens)}`)
  if (meter === 'tokens+limits') {
    for (const w of u.limits) parts.push(`${limitName(w.kind)} limit ${Math.round(w.percentUsed)}%${w.resetsAt ? ` ↻ ${resetLabel(w)}` : ''}`)
  }
  // a subscription has limit windows; the cost only means money on API billing
  if (u.limits.length === 0 && u.costUsd !== null && u.costUsd > 0) parts.push(`$${u.costUsd.toFixed(2)}`)
  return parts
}

/** The status line's short form: context fill and the fullest limit window. */
export const usageShort = (u: Usage, meter: UsageMeter): string[] => {
  if (meter === 'off') return []
  const parts: string[] = []
  if (u.contextPercent !== null) parts.push(`ctx ${Math.round(u.contextPercent)}%`)
  const fullest = [...u.limits].sort((a, b) => b.percentUsed - a.percentUsed)[0]
  if (meter === 'tokens+limits' && fullest !== undefined) parts.push(`${limitName(fullest.kind)} ${Math.round(fullest.percentUsed)}%`)
  return parts
}

/** A warning when a limit window crosses 80 % or 95 %. */
export const limitCrossed = (before: readonly RateWindow[], after: readonly RateWindow[]): string | undefined => {
  for (const w of after) {
    const previous = before.find(b => b.kind === w.kind)?.percentUsed ?? 0
    for (const threshold of [95, 80]) {
      if (previous < threshold && w.percentUsed >= threshold) {
        const reset = w.resetsAt ? `, resets ${resetLabel(w)}` : ''
        return `${limitName(w.kind)} usage limit at ${Math.round(w.percentUsed)}%${reset}`
      }
    }
  }
  return undefined
}

// ------------------------------------------------------------------ briefs

/** The author's briefing of the party for one project: party.md in the paper's folder. */
export const BRIEF_FILE = 'party.md'

const briefKey = (heading: string): string | undefined => {
  const first = heading.trim().split(/[\s—–]+/)[0]?.toLowerCase() ?? ''
  if (first === 'everyone' || first === 'all') return 'everyone'
  return personaById(first)?.id
}

/** Sections of party.md by key ('everyone' or a persona id), comments and blank lines removed. */
export const parseBriefs = (text: string): Record<string, string> => {
  const out: Record<string, string> = {}
  const body = text.replace(/<!--[\s\S]*?-->/g, '')
  const parts = body.split(/^## +(.+)$/m)
  for (let i = 1; i < parts.length; i += 2) {
    const key = briefKey(parts[i]!)
    const content = (parts[i + 1] ?? '').trim()
    if (key !== undefined && content !== '') out[key] = content
  }
  return out
}

/** What a persona is told about this project: the shared context, then its own brief. */
export const briefFor = (briefs: Readonly<Record<string, string>>, personaId: string): string =>
  [
    briefs.everyone ? `About the project:\n${briefs.everyone}` : '',
    briefs[personaId] ? `What to look for:\n${briefs[personaId]}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

/** party.md with one section's body replaced (or the section added), the rest untouched. */
export const setBrief = (text: string, key: string, body: string): string => {
  const persona = personaById(key)
  const heading = key === 'everyone' ? 'everyone — the whole party' : `${persona!.id} — ${persona!.name}`
  const lines = text.split('\n')
  const start = lines.findIndex(l => /^## +/.test(l) && briefKey(l.replace(/^## +/, '')) === key)
  const section = [`## ${heading}`, body.trim(), '']
  if (start < 0) return `${text.replace(/\s*$/, '')}\n\n${section.join('\n')}`
  let end = start + 1
  while (end < lines.length && !/^## +/.test(lines[end]!)) end++
  // keep the guiding comment under the heading, replace what the author wrote
  const comment = lines.slice(start + 1, end).filter(l => /^\s*<!--.*-->\s*$/.test(l))
  return [...lines.slice(0, start), `## ${heading}`, ...comment, body.trim(), '', ...lines.slice(end)].join('\n')
}

// ------------------------------------------------------------- autosave

/** Paths from `git status --porcelain -z`, renames and copies by their new name. */
export const changedPaths = (porcelain: string): string[] => {
  const tokens = porcelain.split('\0').filter(Boolean)
  const paths: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    paths.push(token.slice(3))
    if (token[0] === 'R' || token[0] === 'C') i++ // the old name follows
  }
  return paths
}

export type FileChange = { file: string; before: number; after: number }

/**
 * One autosave commit's message: the manuscript files with the words gained
 * and lost, and how many entries the AI log gained (null: the log is unchanged).
 */
export const autosaveMessage = (changes: readonly FileChange[], logEntries: number | null = null): string => {
  const log = logEntries === null ? '' : logEntries > 0 ? `AI log +${logEntries} ${logEntries === 1 ? 'entry' : 'entries'}` : 'AI log updated'
  const lines = changes.map(c => `${c.file}: ${c.before} → ${c.after} words`)
  if (log !== '') lines.push(log)
  const body = `${lines.join('\n')}\n\nAutosaved by CoWriting: the author's own text and the AI log, committed unchanged.`
  if (changes.length === 0) return `${log}\n\n${body}`
  const names = changes.map(c => c.file.split('/').pop()!)
  const shown = names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ')
  const delta = changes.reduce((sum, c) => sum + c.after - c.before, 0)
  const words = delta === 0 ? '±0 words' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} words`
  return `Writing: ${shown} (${words})${log === '' ? '' : ` · ${log}`}\n\n${body}`
}
