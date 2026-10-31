import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { FocusMode, Paper, Review, Snapshot, Tab, Usage } from '../types'
import {
  AI_TEXT_MARKER,
  EMPTY_STATS,
  EMPTY_USAGE,
  limitCrossed,
  toUsage,
  usageParts,
  usageShort,
  GUARD_MESSAGE,
  READ_ONLY_TOOLS,
  absolutePath,
  advanceGame,
  authorFileOf,
  authorGuardMessage,
  bashTouchesManuscript,
  bashWritesTo,
  briefFor,
  categoryFor,
  changedFiles,
  computeStats,
  guardInputOf,
  handBackAgentId,
  WATCH_DEFAULT,
  isManuscriptPath,
  newId,
  overrelianceNudge,
  personaForAgent,
} from './core'
import { PERSONAS, customPersonas, isCustomId, partyPersonas, personaById, personaFileSkeleton } from './personas'
import { drawBand, drawLiveBand, drawPane, drawReviewRow, drawToolLine, drawWaiting } from './ui'
import { AUTOSAVE_TICK_MS, autosaveTick } from './autosave'
import { SCOPE_FILE, checkPoints, measureScope } from './scope'
import { IDLE_WATCH, PAUSE_MS, TICK_MS, resetWatchBaseline, watchTick } from './watch'
import {
  CONVERTED_FILE,
  appendLog,
  authorNames,
  describePapers,
  findPaper,
  fingerprintAuthorFiles,
  loadParty,
  manuscriptWords,
  readGame,
  readLog,
  readBriefs,
  readText,
  readToolCounts,
  openPaper,
  setLogVersions,
  targetFolder,
  upgradePaper,
  withLog,
  writeBrief,
  writeGame,
  writeParty,
} from './workspace'

type $ = EngineInterface

const PANE = 'cowriting'
const CONTRACT_SECTION = 'cowriting-contract'

const EMPTY_SNAPSHOT: Snapshot = {
  paper: null,
  stats: EMPTY_STATS,
  progress: null,
  nudge: null,
  lastWasAiText: false,
  briefed: [],
  scope: null,
}

export const snapshotAtom = atom({ plugin: 'cowrite', key: 'snapshot' } as const, EMPTY_SNAPSHOT, {
  shape: 'snapshot-4',
})
export const tabAtom = atom({ plugin: 'cowrite', key: 'tab' } as const, 'party' as Tab)
export const bandHiddenAtom = atom({ plugin: 'cowrite', key: 'isBandHidden' } as const, false)
// the same value watch.ts keeps; the state scan wants each module's atoms declared in that module
const watchAtom = atom({ plugin: 'cowrite', key: 'watch' } as const, IDLE_WATCH, { shape: 'watch-2' })
const focusAtom = atom({ plugin: 'cowrite', key: 'focus' } as const, null as FocusMode | null)
const usageAtom = atom({ plugin: 'cowrite', key: 'usage' } as const, EMPTY_USAGE as Usage, { shape: 'usage-1' })
const FOCUS_MODES: readonly FocusMode[] = ['off', 'calm', 'focus']
const reviewsAtom = atom({ plugin: 'cowrite', key: 'reviews' } as const, {} as Record<string, Review>, { shape: 'reviews-1' })

/** For a paper opened by path: the session's folder is somewhere else. */
const elsewhereText = (root: string) =>
  `The paper folder is ${root}, not the session's working directory. Paths like manuscript/ or ai-log/ are relative to it: ` +
  `use absolute paths under ${root} for file tools, and run shell commands and CoWriting tools from it (cd "${root}" && …).`

const contractText = (paper: Paper, vault: string, notesFolder: string, cwd: string) =>
  [
    '# CoWriting: assist-only mode',
    `Active paper: "${paper.name}" (${paper.format}, ${paper.language === 'de' ? 'German' : 'English'}) at ${paper.root}.`,
    paper.root !== cwd ? elsewhereText(paper.root) : '',
    'The human is the sole author (DFG good scientific practice). You assist; you never ghostwrite.',
    '- Never write or rewrite prose meant for the manuscript (no paragraphs, rephrasings, abstracts, introductions). Files under manuscript/ are read-only for you.',
    '- Inside the paper you write only in notes/ai/, scope.md, disclosure/, party/ (the author\'s own review experts, at their request) and the log. Every other file (manuscript/, literature/, CLAUDE.md, party.md, paper.json, settings) is the author\'s: ask them to change it.',
    `- The review party of this paper: ${partyPersonas(paper.party).map(p => `cowrite:${p.id} (${p.name})`).join(', ') || 'nobody yet'}. /cowrite:party changes it; a party/<id>.md file is an expert of the author's own.`,
    '- Give located feedback (file:line), Socratic questions, structure and argument critique, explanations, literature help, checklists and overviews.',
    '- Language exception: for grammar, spelling and punctuation you may show the corrected sentence together with the rule. No stylistic rewrites.',
    `- If the author explicitly insists on text written by you, start that text with ${AI_TEXT_MARKER} and remind them it must be disclosed.`,
    '- Never invent references. Cite only with a verified DOI/URL or a citekey present in the bibliography under literature/; mark anything else UNVERIFIED.',
    '- Label literature summaries as "AI summary – read the original". No direct quotes without page numbers from the source.',
    '- Put AI notes only in notes/ai/ (header: "AI-generated (Claude), <date>, not manuscript text").',
    vault !== ''
      ? `- Obsidian vault at ${vault}: read it as the author's knowledge base and cite their notes as [[note]]. Write only into ${vault}/${notesFolder}/${paper.name}/ with frontmatter ai_generated: true.`
      : '',
    '- After substantial help, remind the author to annotate it (/cowrite:annotate).',
    `- Reply in the author's language; give manuscript feedback in the manuscript's language (${paper.language}).`,
  ]
    .filter(Boolean)
    .join('\n')

type Config = {
  vault: string
  notesFolder: string
  isGame: boolean
  watchModel: string
  focus: FocusMode
  meter: 'off' | 'tokens' | 'tokens+limits'
  isAutosave: boolean
}

// Per-turn bookkeeping; a reload loses only the turn in flight.
let model = 'unknown'
let turn: { id: string; personas: Set<string>; tools: Set<string>; agents: Record<string, string> } | null = null
// agentId → persona id of the subagents launched as personas; the log keeps it across reloads
const spawned = new Map<string, string>()
let watchTimer: { cancel: () => void } | null = null
let autosaveTimer: { cancel: () => void } | null = null

async function refresh($: $, cfg: Config, isTurnEnd = false, lastWasAiText = false): Promise<Snapshot> {
  const found = await findPaper($)
  if (found === null) {
    await update($, snapshotAtom, () => EMPTY_SNAPSHOT)
    $.ui.status(undefined)
    return EMPTY_SNAPSHOT
  }
  // the paper's own experts join its party once they are loaded
  await loadParty($, found.root).catch(() => [])
  const paper = (await findPaper($)) ?? found
  const stats = computeStats(await readLog($, paper.root), new Date())
  let progress = null
  if (cfg.isGame) {
    const previous = await readGame($, paper.root)
    const counts = await readToolCounts($, paper.root)
    const words = await manuscriptWords($, paper)
    progress = advanceGame({ ...previous, ...counts }, words, stats, new Date().toISOString().slice(0, 10))
    if (JSON.stringify(progress.game) !== JSON.stringify(previous)) {
      await writeGame($, paper.root, progress.game).catch(() => undefined)
    }
    if (isTurnEnd || progress.unlocked.length > 0) {
      for (const a of progress.unlocked) $.ui.toast(`🏆 Achievement unlocked: ${a.title}`)
    }
  }
  const snapshot: Snapshot = {
    paper,
    stats,
    progress,
    nudge: overrelianceNudge(stats) ?? null,
    lastWasAiText,
    briefed: Object.keys(await readBriefs($, paper.root).catch(() => ({}))),
    scope: await measureScope($, paper, new Date().toISOString().slice(0, 10)).catch(() => null),
  }
  await update($, snapshotAtom, () => snapshot)
  await showStatus($, cfg)
  return snapshot
}

async function showStatus($: $, cfg: Config): Promise<void> {
  const { paper, progress, stats, scope } = await read($, snapshotAtom)
  if (paper === null) return $.ui.status(undefined)
  const parts = [`✍ ${paper.name}`, 'assist-only']
  if (scope !== null) parts.push(`🎯 ${Math.round(scope.overall * 100)} %`)
  if (progress !== null) parts.push(`Lv${progress.level}`)
  if (stats.unannotated > 0) parts.push(`${stats.unannotated} to classify`)
  if ((await read($, watchAtom)).isOn) parts.push('👁 live')
  parts.push(...usageShort(await read($, usageAtom), cfg.meter))
  $.ui.status(parts.join(' · '))
}

async function measure($: $, cfg: Config, next: Usage): Promise<void> {
  const before = await read($, usageAtom)
  await update($, usageAtom, () => next)
  const alert = cfg.meter === 'tokens+limits' ? limitCrossed(before.limits, next.limits) : undefined
  if (alert !== undefined) $.ui.toast(`⚠ ${alert}`)
  await showStatus($, cfg)
}

async function focusMode($: $, cfg: Config): Promise<FocusMode> {
  return (await read($, focusAtom)) ?? cfg.focus
}

async function annotate($: $, cfg: Config, ref: string, use: string): Promise<void> {
  const snapshot = await read($, snapshotAtom)
  if (snapshot.paper === null) return
  const root = snapshot.paper.root
  // the tool appends to the same file the hooks write: one writer at a time
  const ran = await withLog(root, () =>
    $.process.run(['python3', `${$.plugin.root}/tools/ailog.py`, 'annotate', ref, '--use', use], { cwd: root }),
  )
  $.ui.toast(ran.exitCode === 0 ? `Annotated as ${use}` : `Annotation failed: ${ran.stderr.slice(0, 80)}`)
  await refresh($, cfg)
}

/** A change to the author's files during a tool call: logged, shown, and from then on in the disclosure. */
async function reportGuard($: $, cfg: Config, paper: Paper, tool: string, input: string, files: string[]): Promise<void> {
  await appendLog($, paper.root, {
    type: 'guard',
    ts: new Date().toISOString(),
    session: await $.session.id(),
    paper: paper.name,
    ...(turn !== null ? { ref: turn.id } : {}),
    tool,
    input,
    files,
  }).catch(() => undefined)
  $.ui.toast(`⚠ ${files.join(', ')} changed while ${tool} ran. Logged; check git diff.`)
  await update($, bandHiddenAtom, () => false)
  await refresh($, cfg).catch(() => undefined)
}

/** The plugin's version from its manifest, and the engine's, for the log. */
async function readVersions($: $): Promise<{ plugin?: string; claude_code?: string }> {
  const out: { plugin?: string; claude_code?: string } = {}
  try {
    const manifest = JSON.parse(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`)) as { version?: string }
    if (typeof manifest.version === 'string') out.plugin = manifest.version
  } catch {
    // no manifest to read: the entry goes without
  }
  const engine = await $.session.version().catch(() => null)
  if (engine !== null) out.claude_code = engine.version
  return out
}

/**
 * Submits a prompt for the author and logs it. The engine passes a prompt this plugin submits to
 * every plugin's prompt.submit hook but this one's, so it opens its own turn here: that is where a
 * persona launched by it is counted.
 */
async function submitAsAuthor($: $, cfg: Config, text: string, category: string, command: string): Promise<void> {
  const paper = await findPaper($)
  if (paper !== null) {
    const id = newId()
    turn = { id, personas: new Set(), tools: new Set(), agents: {} }
    await appendLog($, paper.root, {
      type: 'prompt',
      id,
      ts: new Date().toISOString(),
      session: await $.session.id(),
      paper: paper.name,
      category,
      command,
      text,
    }).catch(() => undefined)
  }
  void $.prompt.submit({ text })
}

async function summon($: $, cfg: Config, personaId: string, target: string): Promise<string> {
  const persona = personaById(personaId)
  if (persona === undefined) return `Unknown persona "${personaId}".`
  const what = target === '' ? 'the section I am currently working on (ask me which, if unclear)' : target
  const text =
    `Use the cowrite:${persona.id} agent to review ${what}. ` +
    'Relay its hints and questions as given; do not add rewritten text.'
  await submitAsAuthor($, cfg, text, persona.category, 'summon')
  return `${persona.name} joins the review…`
}

const KEEP_REVIEWS = 20

/** /cowrite:party: who is in this paper's party, and the changes to it; `{ args }` hands a new expert to the skill's interview. */
async function partyCommand($: $, cfg: Config, paper: Paper, verb: string, words: string[]): Promise<string | { args: string }> {
  const broken = await loadParty($, paper.root).catch(() => [])
  const party = (await findPaper($))?.party ?? paper.party
  const members = partyPersonas(party)
  const catalog = party.filter(id => PERSONAS.some(p => p.id === id))
  if (verb === '' || verb === 'list') {
    const line = (p: { id: string; name: string; role: string; source: string }) =>
      `${p.source === 'custom' ? '★' : '✓'} ${p.id} · ${p.name}: ${p.role}`
    const bench = PERSONAS.filter(p => !party.includes(p.id))
    return [
      `Your review party (${members.length}): ★ your own experts (party/<id>.md)`,
      ...members.map(line),
      ...(bench.length > 0 ? ['Not in the party:', ...bench.map(p => `· ${p.id} · ${p.name}: ${p.role}`)] : []),
      ...(broken.length > 0 ? [`Not a persona (missing name, role or text): ${broken.map(id => `party/${id}.md`).join(', ')}`] : []),
      '/cowrite:party add|remove <id …> · /cowrite:party new <id> "<Name>" <role…> makes an expert of your own',
    ].join('\n')
  }
  if (verb === 'add' || verb === 'remove') {
    if (words.length === 0) return `Usage: /cowrite:party ${verb} <id …>`
    const unknown = words.filter(w => !PERSONAS.some(p => p.id === w))
    const own = unknown.filter(w => customPersonas().some(p => p.id === w))
    if (own.length > 0 && verb === 'remove') return `${own.join(', ')}: your own experts are their files; delete party/<id>.md to retire one.`
    if (unknown.length > 0) return `Not in the catalogue: ${unknown.join(', ')}. It has: ${PERSONAS.map(p => p.id).join(', ')}.`
    const next = verb === 'add' ? [...catalog, ...words.filter(w => !catalog.includes(w))] : catalog.filter(id => !words.includes(id))
    await writeParty($, paper.root, next)
    await refresh($, cfg)
    const names = words.map(w => personaById(w)?.name ?? w).join(', ')
    return verb === 'add' ? `${names} joined the party.` : `${names} left the party.`
  }
  if (verb === 'new') {
    const [id = '', ...rest] = words
    if (!isCustomId(id)) {
      return id === ''
        ? 'Usage: /cowrite:party new <id> "<Name>" <role…>, e.g. /cowrite:party new neurologist "The Neurologist" clinical neurology, diagnostics'
        : `"${id}" is not a free id: lowercase letters, digits and dashes, and not a catalogue persona's.`
    }
    const quoted = /^"([^"]+)"\s*(.*)$/.exec(rest.join(' '))
    const name = quoted?.[1] ?? rest.join(' ')
    const role = quoted?.[2]?.trim() ?? ''
    const file = `${paper.root}/party/${id}.md`
    if (await $.fs.exists(file)) return `party/${id}.md exists already; edit it, or /cowrite:brief ${id} to tell them what to look for.`
    await $.fs.write(file, personaFileSkeleton(id, name || id, role || '(what this expert looks at)'))
    await loadParty($, paper.root).catch(() => [])
    return { args: `new ${id} "${name || id}" ${role}`.trim() }
  }
  return 'Usage: /cowrite:party [add|remove <id …> | new <id> "<Name>" <role…>]'
}

/** A step of a persona at work: what the progress row and the party card show. */
const SCOPE_INTERVIEW =
  `Help me set the scope of this paper in ${SCOPE_FILE}. Interview me, one question at a time: the goal (what should a reader ` +
  'know or believe afterwards), the points I want to make, the length in words or pages, figures, tables and references, the ' +
  'sections with word targets and how far each one is (outline, draft, revised, final), and the deadline. Then write my answers ' +
  `into ${SCOPE_FILE} in my words, following its structure (## Goal, ## Targets, ## Sections, ## Points as "- [ ] …" lines) and ` +
  'keeping its comment lines. Do not add points of your own; you may ask whether something is missing. Show me the result.'

async function scopeCommand($: $, cfg: Config, verb: string): Promise<string> {
  const paper = await findPaper($)
  if (paper === null) return 'No paper here: open one with /cowrite:paper <path>, or set one up with /cowrite:init.'
  if (verb === 'check') {
    $.ui.toast('🎯 Checking your points…')
    const text = await checkPoints($, paper, cfg.watchModel)
    await refresh($, cfg)
    return text
  }
  if (verb === 'edit' || verb === 'setup') {
    await submitAsAuthor($, cfg, SCOPE_INTERVIEW, 'meta', 'scope')
    return '🎯 Setting the scope: answer the questions…'
  }
  const { scope } = await refresh($, cfg)
  await update($, tabAtom, () => 'scope')
  await $.ui.open({ id: PANE, title: 'CoWriting', focus: true, backgroundColor: 'transparent' })
  if (scope === null) return `No scope yet: /cowrite:scope edit sets it up with you, or write ${SCOPE_FILE} yourself.`
  const pct = (n: number) => `${Math.round(n * 100)} %`
  return `🎯 ≈ ${pct(scope.overall)} · content ${pct(scope.content)}${scope.finish === null ? '' : ` · finish ${pct(scope.finish)}`}`
}

async function stepReview($: $, agentId: string, step: string): Promise<void> {
  await update($, reviewsAtom, all => {
    const entry = Object.entries(all).find(([, r]) => r.agentId === agentId && !r.isDone)
    if (entry === undefined) return all
    return { ...all, [entry[0]]: { ...entry[1], steps: entry[1].steps + 1, lastStep: step } }
  })
}

async function finishReview($: $, agentId: string): Promise<void> {
  await update($, reviewsAtom, all => {
    const entry = Object.entries(all).find(([, r]) => r.agentId === agentId && !r.isDone)
    return entry === undefined ? all : { ...all, [entry[0]]: { ...entry[1], isDone: true, lastStep: 'done' } }
  })
}

const stepLabel = (tool: string, input: Record<string, unknown>) => {
  const target = String(input.file_path ?? input.pattern ?? input.query ?? input.url ?? input.command ?? '')
  const short = target.split('/').pop()?.slice(0, 28) ?? ''
  return short === '' ? tool : `${tool} ${short}`
}

async function watchStep($: $, cfg: Config): Promise<void> {
  const reviewed = await watchTick($, cfg.watchModel).catch(() => false)
  if (reviewed) await refresh($, cfg)
}

async function autosaveStep($: $, cfg: Config): Promise<void> {
  const saved = await autosaveTick($).catch(() => null)
  if (saved === null) return
  if ((await focusMode($, cfg)) !== 'focus') $.ui.toast(`💾 ${saved}`)
  await refresh($, cfg).catch(() => undefined)
}

function startWatching($: $, cfg: Config): void {
  watchTimer?.cancel()
  resetWatchBaseline()
  watchTimer = $.clock.every(TICK_MS, () => void watchStep($, cfg))
}

async function setWatching($: $, cfg: Config, isOn: boolean, personas?: string[]): Promise<void> {
  if (isOn) startWatching($, cfg)
  else {
    watchTimer?.cancel()
    watchTimer = null
  }
  const party = (await findPaper($))?.party ?? []
  const kept = (ids: readonly string[]) => ids.filter(id => party.includes(id))
  await update($, watchAtom, s => ({
    ...s,
    isOn,
    personas: personas ?? (kept(s.personas).length > 0 ? kept(s.personas) : kept([...WATCH_DEFAULT])),
    status: isOn ? `watching: pause for ${PAUSE_MS / 1000} s after writing to get hints` : 'off',
  }))
  await refresh($, cfg)
}

/** A cowrite: command answers in place of its skill; if it fails, say so rather than run the skill's text. */
function commandFailed() {
  return { text: 'CoWriting: that command failed. Try again, or restart Claude Code.' }
}

export const register: Register = (on, options) => {
  const cfg: Config = {
    vault: String(options.obsidianVault ?? ''),
    notesFolder: String(options.aiNotesFolder ?? 'AI-Notes'),
    isGame: options.game !== false,
    watchModel: String(options.watchModel ?? 'haiku') || 'haiku',
    focus: (FOCUS_MODES as readonly string[]).includes(String(options.focusMode)) ? (options.focusMode as FocusMode) : 'calm',
    meter: options.usageMeter === 'off' || options.usageMeter === 'tokens' ? options.usageMeter : 'tokens+limits',
    isAutosave: options.autosave !== false,
  }
  const { vault, notesFolder, isGame } = cfg

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    setLogVersions(await readVersions($))
    if ((await read($, watchAtom)).isOn) startWatching($, cfg) // a reload keeps watching
    autosaveTimer?.cancel()
    autosaveTimer = cfg.isAutosave ? $.clock.every(AUTOSAVE_TICK_MS, () => void autosaveStep($, cfg)) : null
    const usage = await $.session.usage().catch(() => null)
    if (usage !== null) await update($, usageAtom, () => toUsage(usage))
    const snapshot = await refresh($, cfg)
    if (snapshot.paper !== null) void $.ui.open({ id: PANE, title: 'CoWriting', backgroundColor: 'transparent' })
    return result
  })

  // A typed command cannot submit a prompt from its hook (the engine holds that turn), so the
  // commands that need the model hand on to their skill's text; the pane's buttons submit directly.
  on('command.run', { command: 'cowrite:scope' }, async ($, e, next) => {
    const verb = e.args.trim().toLowerCase()
    if (!['', 'check', 'edit', 'setup'].includes(verb)) return { text: 'Usage: /cowrite:scope [check|edit]' }
    if (verb === 'edit' || verb === 'setup') {
      if ((await findPaper($)) === null) return { text: 'No paper here: open one with /cowrite:paper <path>, or set one up with /cowrite:init.' }
      return next({ ...e, args: 'edit' })
    }
    return { text: await scopeCommand($, cfg, verb) }
  }).catch(commandFailed)

  on('command.run', { command: 'cowrite:pane' }, async ($, e) => {
    const wanted = e.args.trim().toLowerCase()
    const tab = (['party', 'live', 'log', 'scope', 'progress'] as const).find(t => t === wanted)
    if (wanted !== '' && tab === undefined) return { text: 'Usage: /cowrite:pane [party|live|log|scope|progress]' }
    if (tab !== undefined) await update($, tabAtom, () => tab)
    await refresh($, cfg)
    await $.ui.open({ id: PANE, title: 'CoWriting', focus: true, backgroundColor: 'transparent' })
    return { text: `CoWriting pane${tab ? ` · ${tab}` : ''} · keys 1–4 tabs, r refresh, Esc back` }
  }).catch(commandFailed)

  on('command.run', { command: 'cowrite:paper' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === '') return { text: await describePapers($) }
    // /cowrite:paper upgrade: what an older workspace lacks; `apply` makes the changes, the author's copy kept
    const upgrade = /^upgrade(\s+apply)?$/.exec(arg)
    if (upgrade !== null) {
      const paper = await findPaper($)
      if (paper === null) return { text: 'No paper here: open one with /cowrite:paper <path>, or set one up with /cowrite:init.' }
      const text = await upgradePaper($, paper.root, upgrade[1] !== undefined)
      if (upgrade[1] !== undefined) await refresh($, cfg)
      return { text }
    }
    const text = await openPaper($, arg)
    await refresh($, cfg)
    return { text }
  }).catch(commandFailed)

  // the init skill does the setting up; a path argument makes that folder the session's paper
  on('command.run', { command: 'cowrite:init' }, async ($, e, next) => {
    const arg = e.args.trim()
    if (arg !== '') await targetFolder($, arg)
    return next(e)
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  on('command.run', { command: 'cowrite:watch' }, async ($, e) => {
    const paper = await findPaper($)
    if (paper === null) return { text: 'No paper here: open one with /cowrite:paper <path>, or set one up with /cowrite:init.' }
    const words = e.args.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const state = await read($, watchAtom)
    const verb = words[0] === 'on' || words[0] === 'off' ? words.shift()! : words.length > 0 ? 'on' : state.isOn ? 'off' : 'on'
    if (verb === 'off') {
      await setWatching($, cfg, false)
      return { text: 'Live review stopped.' }
    }
    const active = partyPersonas(paper.party)
    let personas: string[] | undefined
    if (words.includes('all')) personas = active.map(p => p.id)
    else if (words.length > 0) {
      const unknown = words.filter(w => personaById(w) === undefined || !active.includes(personaById(w)!))
      if (unknown.length > 0) {
        return { text: `Unknown persona(s): ${unknown.join(', ')}. Choose from: ${active.map(p => p.id).join(', ')}, or all.` }
      }
      personas = words.map(w => personaById(w)!.id)
    }
    await setWatching($, cfg, true, personas)
    const names = (await read($, watchAtom)).personas.map(id => personaById(id)?.name ?? id).join(', ')
    return { text: `👁 Live review on · ${names} · hints show above the prompt when you pause · /cowrite:watch off` }
  }).catch(commandFailed)

  on('command.run', { command: 'cowrite:brief' }, async ($, e, next) => {
    const paper = await findPaper($)
    if (paper === null) return { text: 'No paper here: open one with /cowrite:paper <path>, or set one up with /cowrite:init.' }
    const [who = '', ...rest] = e.args.trim().split(/\s+/)
    const active = partyPersonas(paper.party)
    if (who === '') {
      const briefs = await readBriefs($, paper.root)
      const line = (key: string, label: string) => `${briefs[key] ? '📋' : '·'} ${label}${briefs[key] ? `: ${briefs[key]!.split('\n')[0]!.slice(0, 60)}` : ''}`
      return {
        text: [
          'Briefs in party.md:',
          line('everyone', 'everyone'),
          ...active.map(p => line(p.id, p.id)),
          '/cowrite:brief <persona> starts an interview · /cowrite:brief <persona> <text> sets it · or edit party.md',
        ].join('\n'),
      }
    }
    const key = who === 'all' || who === 'everyone' ? 'everyone' : personaById(who)?.id
    if (key === undefined || (key !== 'everyone' && !active.some(p => p.id === key))) {
      return { text: `Unknown persona "${who}". Choose from: everyone, ${active.map(p => p.id).join(', ')}.` }
    }
    const persona = personaById(key)
    const name = persona?.name ?? 'the whole party'
    const text = rest.join(' ').trim()
    if (text !== '') {
      await writeBrief($, paper.root, key, text)
      await refresh($, cfg)
      return { text: `📋 Brief for ${name} saved in party.md.` }
    }
    // the interview: the skill's text, with the section heading as its argument
    return next({ ...e, args: key === 'everyone' ? 'everyone — the whole party' : `${persona!.id} — ${persona!.name}` })
  }).catch(commandFailed)

  on('command.run', { command: 'cowrite:party' }, async ($, e, next) => {
    const paper = await findPaper($)
    if (paper === null) return { text: 'No paper here: open one with /cowrite:paper <path>, or set one up with /cowrite:init.' }
    const [verb = '', ...words] = e.args.trim().split(/\s+/).filter(Boolean)
    const answer = await partyCommand($, cfg, paper, verb.toLowerCase(), words)
    return typeof answer === 'string' ? { text: answer } : next({ ...e, args: answer.args })
  }).catch(commandFailed)

  on('command.run', { command: 'cowrite:ask' }, async ($, e, next) => {
    const [who = '', ...rest] = e.args.trim().split(/\s+/)
    const persona = personaById(who)
    const question = rest.join(' ').trim()
    if (persona === undefined || question === '') return { text: 'Usage: /cowrite:ask <persona> <question>' }
    return next({ ...e, args: `${persona.id} ${question}` })
  }).catch(commandFailed)

  on('command.run', { command: 'cowrite:quiet' }, async ($, e) => {
    const wanted = e.args.trim().toLowerCase()
    const current = await focusMode($, cfg)
    const mode = wanted === '' ? FOCUS_MODES[(FOCUS_MODES.indexOf(current) + 1) % FOCUS_MODES.length]! : FOCUS_MODES.find(m => m === wanted)
    if (mode === undefined) return { text: 'Usage: /cowrite:quiet [off|calm|focus]' }
    await update($, focusAtom, () => mode)
    const what = {
      off: 'Claude Code shows all its work.',
      calm: "Claude Code's actions are one dim line each.",
      focus: 'Only you, the personas and their progress; ctrl+o shows everything.',
    }[mode]
    return { text: `Focus: ${mode}. ${what}` }
  }).catch(commandFailed)

  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    await measure($, cfg, toUsage(e)).catch(() => undefined)
    return result
  })

  on('command.run', { command: 'cowrite:summon' }, async ($, e, next) => {
    const [id = '', ...rest] = e.args.trim().split(/\s+/)
    const party = partyPersonas((await findPaper($))?.party ?? [])
    const persona = personaById(id)
    if (id === '' || persona === undefined) {
      const names = party.map(p => p.id).join(', ')
      return { text: `${id === '' ? '' : `Unknown persona "${id}". `}Usage: /cowrite:summon <persona> [file]. Your party: ${names}` }
    }
    return next({ ...e, args: `${persona.id} ${rest.join(' ')}`.trim() })
  }).catch(commandFailed)

  on('prompt.compose', async ($, e, next) => {
    model = e.model
    const result = await next(e)
    const paper = await findPaper($)
    if (paper === null) return result
    return {
      sections: [
        ...result.sections.filter(s => s.id !== CONTRACT_SECTION),
        { id: CONTRACT_SECTION, text: contractText(paper, vault, notesFolder, await $.session.cwd()), scope: 'session' },
      ],
    }
  })

  on('prompt.submit', async ($, e, next) => {
    const result = await next(e)
    const paper = await findPaper($)
    if (paper === null) return result
    const id = newId()
    turn = { id, personas: new Set(), tools: new Set(), agents: {} }
    // A subagent's report coming back is not the author's prompt: log it as that persona's turn.
    // known by the engine's frame around it, whatever origin this build stamps; never one the author typed
    const agentId = e.origin?.kind !== 'composer' ? handBackAgentId(e.text) : undefined
    const agent =
      agentId === undefined
        ? undefined
        : personaById(spawned.get(agentId) ?? personaForAgent(await readLog($, paper.root), agentId) ?? '')
    if (agent !== undefined) turn.personas.add(agent.id)
    if (agentId !== undefined) await finishReview($, agentId)
    await appendLog($, paper.root, {
      type: 'prompt',
      id,
      ts: new Date().toISOString(),
      session: await $.session.id(),
      paper: paper.name,
      category: agent?.category ?? categoryFor(e.command?.name, e.command ? e.command.args : e.text),
      ...(e.command ? { command: e.command.name } : {}),
      ...(agentId !== undefined ? { origin: 'agent' as const } : {}),
      ...(agent !== undefined ? { agent: agent.id } : {}),
      text: e.text,
    }).catch(() => undefined)
    return result
  }).catch(($, e, next) => next(e))

  // A Word or LibreOffice file is read as text through pandoc, so the party can review a
  // manuscript written there. Without pandoc, or on an error, the Read tool answers as usual.
  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const input = e as unknown as { file_path?: string; offset?: number; limit?: number }
    const given = String(input.file_path ?? '')
    if (!CONVERTED_FILE.test(given)) return next(e)
    const path = absolutePath(await $.session.cwd(), given)
    const text = await readText($, path).catch(() => null)
    if (text === null) return next(e)
    const lines = text.split('\n')
    const start = Math.max(1, Math.floor(input.offset ?? 1))
    const slice = lines.slice(start - 1, input.limit === undefined ? undefined : start - 1 + Math.max(0, Math.floor(input.limit)))
    return {
      result: {
        type: 'text',
        file: { filePath: path, content: slice.join('\n'), numLines: slice.length, startLine: start, totalLines: lines.length },
      },
    }
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const input = e as unknown as Record<string, unknown>
    const path = String(input.file_path ?? input.notebook_path ?? '')
    const command = String(input.command ?? '')
    const isFileWrite = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool)
    // a manuscript folder is refused wherever it is, paper or not
    if (isFileWrite && isManuscriptPath(path)) return { deny: GUARD_MESSAGE }
    if (tool === 'Bash' && bashTouchesManuscript(command)) return { deny: GUARD_MESSAGE }
    // inside the paper, everything but Claude's own places is the author's
    const paper = READ_ONLY_TOOLS.has(tool) ? null : await findPaper($).catch(() => null)
    if (paper !== null && (isFileWrite || tool === 'Bash')) {
      const cwd = await $.session.cwd()
      if (isFileWrite) {
        const file = authorFileOf(absolutePath(cwd, path), paper.root)
        if (file !== null) return { deny: authorGuardMessage(file) }
      } else {
        const isAuthors = (target: string) => authorFileOf(absolutePath(cwd, target), paper.root) !== null
        if (bashWritesTo(command, isAuthors, await authorNames($, paper.root))) return { deny: authorGuardMessage('the file this command writes') }
      }
    }

    // an expert's file just written: load it now, so the agent exists from the next turn on
    if (paper !== null && isFileWrite && /(^|\/)party\/[^/]+\.md$/.test(absolutePath(await $.session.cwd(), path))) {
      const result = await next(e)
      await loadParty($, paper.root).catch(() => [])
      return result
    }

    if (typeof input.agentId === 'string') void stepReview($, input.agentId, stepLabel(tool, input)).catch(() => undefined)
    if (turn !== null) {
      turn.tools.add(tool)
      const agent = personaById(String(input.subagent_type ?? ''))
      if (agent !== undefined) turn.personas.add(agent.id)
    }
    if (READ_ONLY_TOOLS.has(tool)) return next(e)

    // The patterns above can be fooled; the files cannot. Whatever changed in the author's files
    // while this call ran is recorded, shown and disclosed, so the git history can be read against it.
    if (paper === null) return next(e)
    const before = await fingerprintAuthorFiles($, paper).catch(() => null)
    const result = await next(e)
    if (before === null) return result
    const after = await fingerprintAuthorFiles($, paper).catch(() => null)
    const files = after === null ? [] : changedFiles(before, after)
    if (files.length > 0) void reportGuard($, cfg, paper, tool, guardInputOf(tool, input), files)
    return result
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'CoWriting: the manuscript guard failed, so the call was refused.' }))

  // Subagents start through agent.spawn, not tool.call: this is where a summoned persona is counted.
  on('agent.spawn', async ($, e, next) => {
    // the paper's location and the author's briefing travel with every persona's task
    const briefed = personaById(e.subagentType)
    const paper = briefed !== undefined ? await findPaper($).catch(() => null) : null
    const brief = paper ? briefFor(await readBriefs($, paper.root).catch(() => ({})), briefed!.id) : ''
    const isElsewhere = paper !== null && paper.root !== (await $.session.cwd())
    const extra = [
      isElsewhere ? `## Where the paper is\n${elsewhereText(paper!.root)}` : '',
      brief !== '' ? `## The author's briefing for you in this project\n${brief}` : '',
    ].filter(Boolean)
    const result = await next(extra.length === 0 ? e : { ...e, prompt: [e.prompt, ...extra].join('\n\n') })
    try {
      const persona = personaById(e.subagentType)
      if (persona !== undefined && result.agentId !== undefined) spawned.set(result.agentId, persona.id)
      if (persona !== undefined && turn !== null) {
        turn.personas.add(persona.id)
        if (result.agentId !== undefined) turn.agents[result.agentId] = persona.id
      }
      if (persona !== undefined) {
        const review: Review = { persona: persona.id, agentId: result.agentId ?? '', steps: 0, lastStep: 'starting', isDone: false }
        await update($, reviewsAtom, all =>
          Object.fromEntries([...Object.entries(all), [e.tool_use_id, review]].slice(-KEEP_REVIEWS)),
        )
      }
    } catch {
      // bookkeeping only; never fail a spawn over it
    }
    return result
  }).catch(($, e, next) => next(e))

  // Only the members of this paper's party are offered to the model; the rest of the catalogue waits.
  on('agent.offer', async ($, e, next) => {
    const persona = personaById(e.agent)
    if (persona === undefined) return next(e)
    const paper = await findPaper($)
    if (paper !== null && !paper.party.includes(persona.id)) return { isOffered: false }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) {
      await finishReview($, e.agentId).catch(() => undefined)
      return result
    }
    if (turn === null) return result
    const done = turn
    turn = null
    const paper = await findPaper($)
    if (paper === null) return result
    const isAiText = e.answer.includes(AI_TEXT_MARKER)
    await appendLog($, paper.root, {
      type: 'response',
      ref: done.id,
      ts: new Date().toISOString(),
      model,
      personas: [...done.personas],
      ...(Object.keys(done.agents).length > 0 ? { agents: done.agents } : {}),
      tools_used: [...done.tools],
      ai_text_flag: isAiText,
      answer: e.answer,
    }).catch(() => undefined)
    if (isAiText) {
      $.ui.toast('AI-written text in this answer: it is logged and must be disclosed.')
      await update($, bandHiddenAtom, () => false)
    }
    await refresh($, cfg, true, isAiText)
    return result
  })

  // Transcript: a persona at work is one progress row, its launch receipt is hidden, and the
  // summon prompt and the hand-back each shrink to one line. ctrl+o shows everything in full.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.props.isExpanded === true) return next(e)
    const input = (e.props.input ?? {}) as Record<string, unknown>
    const persona = personaById(String(input.subagent_type ?? ''))
    if (persona !== undefined) {
      const review = (await read($, reviewsAtom))[e.props.tool_use_id]
      return drawReviewRow($, e, { persona, review, isFailed: e.props.isErrored || e.props.isInterrupted })
    }
    const mode = await focusMode($, cfg)
    if (mode === 'off' || e.props.isErrored) return next(e) // errors always show
    return drawToolLine($, e, { label: stepLabel(e.props.tool, input), isRunning: e.props.isRunning, isHidden: mode === 'focus' })
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (e.props.isExpanded === true || e.props.isErrored) return next(e)
    const isPersona = (await read($, reviewsAtom))[e.props.tool_use_id] !== undefined
    if (!isPersona && (await focusMode($, cfg)) === 'off') return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const mode = await focusMode($, cfg)
    if (mode === 'off' || e.props.isExpanded || e.props.isCallsOnly !== true) return next(e)
    const tally = new Map<string, number>()
    for (const call of e.props.calls) tally.set(call.tool, (tally.get(call.tool) ?? 0) + 1)
    const label = `${e.props.calls.length} steps (${[...tally].map(([tool, n]) => (n > 1 ? `${tool} ×${n}` : tool)).join(', ')})`
    return drawToolLine($, e, { label, isRunning: e.props.isActive, isHidden: mode === 'focus' })
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (e.props.isExpanded === true) return next(e)
    const waiting = e.props.waitingFor
    const names = waiting?.agents.map(a => personaById(a.agentType)?.name)
    if (waiting !== undefined && waiting.workflows === 0 && names!.length > 0 && names!.every(n => n !== undefined)) {
      return drawWaiting($, e, names as string[])
    }
    if (waiting !== undefined || (await focusMode($, cfg)) === 'off') return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => {
    if ((await focusMode($, cfg)) === 'off') return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  on('ui.render', { component: 'InfoNotice' }, async ($, e, next) => {
    if ((await focusMode($, cfg)) !== 'focus') return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.props.isSummary !== true || (await focusMode($, cfg)) !== 'focus') return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (e.props.isExpanded) return next(e)
    const { Text } = $.ui.resolve(e)
    const { origin } = e.props
    if (origin.kind === 'task-notification') {
      const review = (await read($, reviewsAtom))[e.props.task?.toolUseId ?? '']
      const persona = personaById(review?.persona ?? '')
      if (persona === undefined) return next(e)
      return (
        <Text dimColor>
          ↩ {persona.name} reported back <Text dimColor>(ctrl+o: full report)</Text>
        </Text>
      )
    }
    if (origin.kind === 'plugin' && origin.name === 'cowrite') {
      const summoned = /cowrite:([a-z0-9-]+) agent to review (.*?)\. Relay/.exec(e.props.text)
      const asked = /cowrite:([a-z0-9-]+) agent to answer my question: "(.*)"\. It may/.exec(e.props.text)
      const briefing = /^Brief (.+?) for this paper\./.exec(e.props.text)
      if (briefing) return <Text dimColor>📋 Briefing {briefing[1]}</Text>
      const creating = /^Add "([^"]+)" to my review party/.exec(e.props.text)
      if (creating) return <Text dimColor>🎭 Creating {creating[1]}</Text>
      if (e.props.text.startsWith('Help me set the scope')) return <Text dimColor>🎯 Setting the scope</Text>
      const match = summoned ?? asked
      const persona = personaById(match?.[1] ?? '')
      if (persona === undefined) return next(e)
      return asked ? (
        <Text dimColor>
          🗨 You asked {persona.name}: “{asked[2]!.slice(0, 80)}”
        </Text>
      ) : (
        <Text dimColor>
          🎭 Summoned {persona.name} · {summoned![2]!.slice(0, 60)}
        </Text>
      )
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const snapshot = await read($, snapshotAtom)
    const tab = await read($, tabAtom)
    const watch = await read($, watchAtom)
    const reviews = await read($, reviewsAtom)
    const usage = await read($, usageAtom)
    return drawPane($, e, {
      usage: usageParts(usage, cfg.meter, watch.tokens ?? 0),
      reviews: Object.values(reviews),
      columns: e.props.bodyColumns,
      snapshot,
      tab,
      watch,
      onWatchToggle: () => void setWatching($, cfg, !watch.isOn),
      personas: partyPersonas(snapshot.paper?.party ?? []),
      isGame,
      onTab: next => void update($, tabAtom, () => next),
      onSummon: id => void summon($, cfg, id, ''),
      onAnnotate: (ref, use) => void annotate($, cfg, ref, use),
      onRefresh: () => void refresh($, cfg),
      onScopeCheck: () => void scopeCommand($, cfg, 'check').then(text => $.ui.toast(text)),
      onScopeEdit: () => void scopeCommand($, cfg, 'edit'),
    })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const snapshot = await read($, snapshotAtom)
    const isHidden = await read($, bandHiddenAtom)
    const watch = await read($, watchAtom)
    if (!e.props.hasSurvey && watch.isOn && !watch.isHidden && watch.hints.length > 0) {
      return drawLiveBand($, e, {
        watch,
        onAnnotate: (ref, use) => void annotate($, cfg, ref, use),
        onHide: () => void update($, watchAtom, s => ({ ...s, isHidden: true })),
      })
    }
    const { stats } = snapshot
    const isDue = stats.unannotated >= 3 || snapshot.lastWasAiText || snapshot.nudge !== null
    if (e.props.hasSurvey || isHidden || snapshot.paper === null || !isDue) return next(e)
    return drawBand($, e, {
      snapshot,
      onAnnotate: (ref, use) => void annotate($, cfg, ref, use),
      onHide: () => void update($, bandHiddenAtom, () => true),
    })
  })
}
