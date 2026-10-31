// The cw (CoWriting) plugin's state contract and the shapes its hooks share.

export type PromptEntry = {
  type: 'prompt'
  id: string
  ts: string
  session: string
  paper: string
  category: string
  command?: string
  /**
   * 'agent': not typed by the author but a subagent's report handed back to the session;
   * 'watch': a live review the plugin started while the author wrote;
   * 'scope': a check of which planned points the text already makes
   */
  origin?: 'agent' | 'watch' | 'scope'
  /** for origin 'agent': the persona whose report this is */
  agent?: string
  text: string
}

export type ResponseEntry = {
  type: 'response'
  ref: string
  ts: string
  model: string
  personas: string[]
  /** subagents this turn launched as personas: agentId → persona id */
  agents?: Record<string, string>
  tools_used: string[]
  ai_text_flag: boolean
  answer: string
}

export type AnnotationEntry = {
  type: 'annotation'
  ref: string
  ts: string
  use: 'adopted' | 'adapted' | 'rejected' | 'info'
  chapter?: string
  note?: string
  category?: string
}

export type LogEntry = PromptEntry | ResponseEntry | AnnotationEntry

export type RecentTurn = {
  id: string
  ts: string
  category: string
  /** what the author asked (or what the turn was) */
  preview: string
  /** what the AI said, flattened */
  answer: string
  /** who it came from: the persona, if any */
  persona?: string
  origin?: 'agent' | 'watch' | 'scope'
  personas: string[]
  isAnnotated: boolean
  /** waits for the author to classify it: not a live hint, not a mere launch of a reviewer */
  isOpen: boolean
  isAiText: boolean
}

export type Stats = {
  turns: number
  today: number
  unannotated: number
  aiText: number
  byCategory: Record<string, number>
  personaConsults: Record<string, number>
  personaAdopted: Record<string, number>
  annotations: number
  recent: RecentTurn[]
  /** turns waiting to be classified, newest first (at most 5) */
  open: RecentTurn[]
}

export type GameFile = {
  version: 1
  baselineWords: number | null
  maxWords: number
  writingDays: string[]
  achievements: string[]
  disclosures: number
  verifiedRefs: number
}

export type Achievement = { id: string; title: string; detail: string }

export type Progress = {
  ownWords: number
  writerXp: number
  integrityXp: number
  xp: number
  level: number
  nextLevelXp: number
  streak: number
  personaLevels: Record<string, number>
  game: GameFile
  unlocked: Achievement[]
}

export type Paper = {
  root: string
  name: string
  format: 'latex' | 'markdown'
  language: 'en' | 'de'
  domainPack: string
  /** false in paper.json: this paper is never autosaved (e.g. a demo inside another repository) */
  autosave: boolean
}

export type Snapshot = {
  paper: Paper | null
  stats: Stats
  progress: Progress | null
  nudge: string | null
  lastWasAiText: boolean
  /** 'everyone' and the persona ids that have a brief in party.md */
  briefed: string[]
  /** progress against scope.md; null: no scope set */
  scope: ScopeProgress | null
}

export type Stage = 'outline' | 'draft' | 'revised' | 'final'
export type PointStatus = 'covered' | 'partial' | 'missing'

/** A point the author plans to make, with what the last check found. */
export type ScopePoint = {
  text: string
  section?: string
  /** ticked by the author in scope.md: done, whatever a check says */
  isTicked: boolean
  status?: PointStatus
  where?: string
  note?: string
}

export type ScopeSection = {
  name: string
  target?: number
  stage?: Stage
  words: number
  /** TODO, FIXME, ??, UNVERIFIED … left in it */
  markers: number
  /** a heading of that name exists in the manuscript */
  isFound: boolean
}

export type Count = { done: number; target?: number }

export type ScopeProgress = {
  goal: string
  words: Count
  figures: Count
  tables: Count
  references: Count
  deadline?: string
  daysLeft?: number
  /** words a day still needed to reach the target by the deadline */
  wordsPerDay?: number
  points: ScopePoint[]
  /** when the points were last checked */
  checkedAt?: string
  sections: ScopeSection[]
  markers: number
  /** 0–1: points made and quantities reached */
  content: number
  /** 0–1: an estimate from the sections' stages and open markers; null: no stages set */
  finish: number | null
  /** 0–1: content, and finish where known */
  overall: number
}

export type Tab = 'party' | 'live' | 'log' | 'scope' | 'progress'

export type LiveHint = {
  /** the log turn of the review that gave it */
  ref: string
  persona: string
  file: string
  line: number
  text: string
  ts: string
}

/** A persona subagent at work, keyed by the Agent tool call that started it. */
export type Review = {
  persona: string
  agentId: string
  steps: number
  lastStep: string
  isDone: boolean
}

export type FocusMode = 'off' | 'calm' | 'focus'

export type RateWindow = { kind: string; percentUsed: number; resetsAt?: string }

/** The session's figures as the engine measures them after each turn. */
export type Usage = {
  contextTokens: number | null
  contextPercent: number | null
  costUsd: number | null
  limits: RateWindow[]
}

export type WatchState = {
  /** tokens the live reviews used this session */
  tokens: number
  isOn: boolean
  personas: string[]
  /** newest first */
  hints: LiveHint[]
  status: string
  lastReviewAt: number
  reviewTimes: number[]
  isHidden: boolean
}

declare module 'claude-code' {
  interface PluginState {
    cw: {
      tab: Tab
      snapshot: Shaped<Snapshot>
      isBandHidden: boolean
      watch: Shaped<WatchState>
      reviews: Shaped<Record<string, Review>>
      /** null: the focusMode option decides */
      focus: FocusMode | null
      usage: Shaped<Usage>
      /** a paper folder opened with /cw:paper <path>; null: the session's folder decides */
      paperRoot: string | null
    }
  }
}
