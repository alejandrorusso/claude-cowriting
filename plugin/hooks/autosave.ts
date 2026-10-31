// Autosave: the author's manuscript and the AI log are committed to git after
// each change, once the files have been quiet for a short pause, so the
// history shows how the text grew next to the AI input that came before it.
// Only manuscript/ and ai-log/ are committed, under the author's own git
// identity and unchanged; whatever else is staged stays as it is.

import type { EngineInterface } from 'claude-code'

import type { Paper } from '../types'
import { autosaveMessage, changedPaths, countWords } from './core'
import type { FileChange } from './core'
import { findPaper } from './workspace'

type Engine = EngineInterface

export const AUTOSAVE_TICK_MS = 15_000
/** How long the manuscript must stay unchanged before it is committed. */
export const AUTOSAVE_PAUSE_MS = 30_000

/** What autosave commits: the author's text and the record of AI input. */
const SAVED = ['manuscript', 'ai-log'] as const
const TEXT_FILE = /\.(md|markdown|tex|txt)$/

// A tick is not re-entered, and a failure is reported once per kind.
let isBusy = false
let reported = ''

function git($: Engine, paper: Paper, args: readonly string[]) {
  return $.process.run(['git', ...args], { cwd: paper.root })
}

function reportOnce($: Engine, kind: string, text: string): void {
  if (reported === kind) return
  reported = kind
  $.ui.toast(text)
}

async function newLogEntries($: Engine, paper: Paper, top: string, path: string): Promise<number> {
  const shown = await git($, paper, ['show', `HEAD:${path}`])
  const lines = (text: string) => text.split('\n').filter(l => l.trim() !== '').length
  const before = shown.exitCode === 0 ? lines(shown.stdout) : 0
  return (await $.fs.read(`${top}/${path}`).then(lines, () => 0)) - before
}

async function wordsAt($: Engine, paper: Paper, top: string, path: string): Promise<FileChange> {
  const shown = await git($, paper, ['show', `HEAD:${path}`])
  const before = shown.exitCode === 0 ? countWords(shown.stdout, paper.format) : 0
  const after = await $.fs.read(`${top}/${path}`).then(text => countWords(text, paper.format), () => 0)
  return { file: path, before, after }
}

/** One look at the manuscript and the AI log; resolves the commit's title when it committed. */
export async function autosaveTick($: Engine): Promise<string | null> {
  if (isBusy) return null
  isBusy = true
  try {
    const paper = await findPaper($)
    if (paper === null || !paper.autosave) return null
    // folder by folder: a folder git cannot see (missing, or empty) would fail the commit
    const changed: string[] = []
    const paths: string[] = []
    for (const folder of SAVED) {
      const status = await git($, paper, ['status', '--porcelain', '-z', '-uall', '--', folder])
      if (status.exitCode !== 0) {
        reportOnce($, 'no-repo', 'CoWriting autosave: the paper folder is not a git repository (run git init there).')
        return null
      }
      const found = changedPaths(status.stdout)
      if (found.length > 0) changed.push(folder)
      paths.push(...found)
    }
    if (paths.length === 0) return null

    const top = (await git($, paper, ['rev-parse', '--show-toplevel'])).stdout.trim()
    const now = await $.clock.now()
    for (const path of paths) {
      const mtime = await $.fs.stat(`${top}/${path}`).then(s => s.mtimeMs, () => 0)
      if (now - mtime < AUTOSAVE_PAUSE_MS) return null // still writing
    }

    const isLog = (path: string) => /(^|\/)ai-log\//.test(path)
    const written = paths.filter(p => !isLog(p))
    const logged = paths.filter(isLog)
    const changes: FileChange[] = []
    for (const path of written) {
      changes.push(TEXT_FILE.test(path) ? await wordsAt($, paper, top, path) : { file: path, before: 0, after: 0 })
    }
    let entries: number | null = null
    for (const path of logged) entries = (entries ?? 0) + Math.max(0, await newLogEntries($, paper, top, path))
    const message = autosaveMessage(changes, entries)

    await git($, paper, ['add', '-A', '--', ...changed])
    const commit = await git($, paper, ['commit', '--quiet', '-m', message, '--', ...changed])
    if (commit.exitCode !== 0) {
      const isIdentity = /tell me who you are|user\.email|user\.name/i.test(commit.stderr)
      reportOnce(
        $,
        isIdentity ? 'identity' : 'commit',
        isIdentity
          ? 'CoWriting autosave needs your git name: git config --global user.name "…" and user.email "…"'
          : `CoWriting autosave could not commit: ${commit.stderr.trim().slice(0, 100)}`,
      )
      return null
    }
    reported = ''
    return message.split('\n')[0]!
  } finally {
    isBusy = false
  }
}
