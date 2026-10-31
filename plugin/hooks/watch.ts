// Live review: while the author writes, a small model looks at the paragraphs
// they just changed and the watching personas leave short hints. A review runs
// once the author pauses, at most once a minute and 20 times an hour, and each
// one is logged like any other AI input.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { LiveHint, Paper, WatchState } from '../types'
import { changedParagraphs, localTime, newId, parseHints, plural, watchExcerpt, watchSystem } from './core'
import type { Paragraph } from './core'
import { partyPersonas, personaById } from './personas'
import { MANUSCRIPT_FILE, appendLog, findPaper, readBriefs, readText } from './workspace'

type $ = EngineInterface

export const TICK_MS = 5_000
export const PAUSE_MS = 20_000
const GAP_MS = 60_000
const PER_HOUR = 20
const KEEP_HINTS = 12

export const IDLE_WATCH: WatchState = {
  tokens: 0,
  isOn: false,
  personas: [],
  hints: [],
  status: 'off',
  lastReviewAt: 0,
  reviewTimes: [],
  isHidden: false,
}

export const watchAtom = atom({ plugin: 'cw', key: 'watch' } as const, IDLE_WATCH, { shape: 'watch-2' })

// What this module has seen of the manuscript; a reload starts a new baseline.
const seen = {
  texts: new Map<string, string>(),
  mtimes: new Map<string, number>(),
  dirty: new Set<string>(),
  lastEditAt: 0,
  isBusy: false,
}

export const resetWatchBaseline = () => {
  seen.texts.clear()
  seen.mtimes.clear()
  seen.dirty.clear()
  seen.lastEditAt = 0
  seen.isBusy = false
}

const join = (...parts: string[]) => parts.join('/').replace(/\/+/g, '/')

async function manuscriptFiles($: $, dir: string, depth: number): Promise<string[]> {
  if (depth > 4 || !(await $.fs.exists(dir))) return []
  const out: string[] = []
  for (const entry of await $.fs.list(dir)) {
    const path = join(dir, entry.name)
    if (entry.kind === 'dir') out.push(...(await manuscriptFiles($, path, depth + 1)))
    else if (entry.kind === 'file' && MANUSCRIPT_FILE.test(entry.name)) out.push(path)
  }
  return out
}

async function setStatus($: $, status: string): Promise<void> {
  await update($, watchAtom, s => ({ ...s, status }))
}

/** One look at the manuscript; resolves true when a review ran and was logged. */
export async function watchTick($: $, model: string): Promise<boolean> {
  const state = await read($, watchAtom)
  if (!state.isOn || seen.isBusy) return false
  const paper = await findPaper($)
  if (paper === null) return false
  const now = await $.clock.now()

  for (const path of await manuscriptFiles($, join(paper.root, 'manuscript'), 0)) {
    const { mtimeMs } = await $.fs.stat(path)
    const known = seen.mtimes.get(path)
    if (known === mtimeMs) continue
    seen.mtimes.set(path, mtimeMs)
    if (known === undefined || !seen.texts.has(path)) {
      seen.texts.set(path, await readText($, path).catch(() => '')) // the baseline: what was there when watching began
      continue
    }
    seen.dirty.add(path)
    seen.lastEditAt = now
  }

  if (seen.dirty.size === 0) return false
  if (now - seen.lastEditAt < PAUSE_MS) {
    if (state.status !== 'you are writing…') await setStatus($, 'you are writing…')
    return false
  }
  if (now - state.lastReviewAt < GAP_MS) return false
  const recent = state.reviewTimes.filter(t => now - t < 3_600_000)
  if (recent.length >= PER_HOUR) {
    await setStatus($, `paused: ${PER_HOUR} reviews in the last hour`)
    return false
  }

  seen.isBusy = true
  try {
    return await review($, paper, state, model, now, recent)
  } finally {
    seen.isBusy = false
  }
}

async function review($: $, paper: Paper, state: WatchState, model: string, now: number, recent: number[]): Promise<boolean> {
  const parts: { file: string; changed: Paragraph[] }[] = []
  for (const path of seen.dirty) {
    const after = await readText($, path).catch(() => null)
    if (after === null) continue // unreadable (pandoc missing, or a save half done): reviewed after the next save
    const changed = changedParagraphs(seen.texts.get(path) ?? '', after, paper.format)
    seen.texts.set(path, after)
    if (changed.length > 0) parts.push({ file: path.slice(paper.root.length + 1), changed })
  }
  seen.dirty.clear()
  if (parts.length === 0) return false

  const active = partyPersonas(paper.party)
  const personas = state.personas.flatMap(id => active.filter(p => p.id === id))
  if (personas.length === 0) return false
  const profilePath = join(paper.root, 'notes', 'ai', 'style-profile.md')
  const profile = (await $.fs.exists(profilePath)) ? (await $.fs.read(profilePath)).slice(0, 2000) : ''

  await update($, watchAtom, s => ({ ...s, status: 'reviewing…', lastReviewAt: now, reviewTimes: [...recent, now] }))
  const answer = await $.model.complete({
    model,
    system: watchSystem(personas, paper.language, profile, await readBriefs($, paper.root).catch(() => ({}))),
    prompt: watchExcerpt(parts),
    maxTokens: 700,
    effort: 'low',
    timeoutMs: 60_000,
  })
  if (!answer.isAnswered) {
    await setStatus($, 'the last live review failed; it will try again after your next change')
    return false
  }
  const used = answer.usage
  const spent = used.input_tokens + used.output_tokens + used.cache_read_input_tokens + used.cache_creation_input_tokens
  await update($, watchAtom, s => ({ ...s, tokens: (s.tokens ?? 0) + spent }))
  const hints = parseHints(answer.text, personas.map(p => p.id))

  // Logged like every AI input: what was looked at, by whom, and what came back.
  const id = newId()
  const ts = new Date(now).toISOString()
  const ranges = parts
    .map(p => `${p.file} l.${p.changed[0]!.start}–${p.changed[p.changed.length - 1]!.end}`)
    .join(', ')
  await appendLog($, paper.root, {
    type: 'prompt',
    id,
    ts,
    session: await $.session.id(),
    paper: paper.name,
    category: personaById(hints[0]?.persona ?? '')?.category ?? 'feedback',
    origin: 'watch',
    text: `Live review (${personas.map(p => p.id).join(', ')}) of ${ranges}`,
  })
  await appendLog($, paper.root, {
    type: 'response',
    ref: id,
    ts,
    model,
    personas: [...new Set(hints.map(h => h.persona))],
    tools_used: [],
    ai_text_flag: false,
    answer: hints.length > 0 ? hints.map(h => `${h.persona} l.${h.line}: ${h.hint}`).join('\n') : '(no hints)',
  })

  const fileFor = (line: number) =>
    parts.find(p => p.changed.some(c => line >= c.start && line <= c.end))?.file ?? parts[0]!.file
  const fresh: LiveHint[] = hints.map(h => ({ ref: id, persona: h.persona, file: fileFor(h.line), line: h.line, text: h.hint, ts }))
  const clock = localTime(ts, true)
  await update($, watchAtom, s => ({
    ...s,
    hints: [...fresh, ...s.hints].slice(0, KEEP_HINTS),
    status: hints.length > 0 ? `${plural(hints.length, 'hint')} at ${clock}` : `looked at ${clock}: nothing to add, keep writing`,
    isHidden: hints.length === 0 ? s.isHidden : false,
  }))
  return true
}
