// The CoWriting pane (party, live, log, scope, progress), the reminder band and the live-hint band.

import type { EngineInterface } from 'claude-code'

import type { Count, RecentTurn, Review, ScopePoint, ScopeProgress, Snapshot, Tab, WatchState } from '../types'
import { ACHIEVEMENTS, USE_LABELS, xpForLevel } from './core'
import { personaById } from './personas'
import type { Persona } from './personas'
import { rasterCells, svgSource } from './sprites'

type $ = EngineInterface
type RenderInput = Parameters<$['ui']['resolve']>[0]

type PaneProps = {
  columns: number
  snapshot: Snapshot
  tab: Tab
  personas: Persona[]
  isGame: boolean
  onTab: (tab: Tab) => void
  onSummon: (id: string) => void
  onAnnotate: (ref: string, use: string) => void
  onRefresh: () => void
  watch: WatchState
  onWatchToggle: () => void
  reviews: Review[]
  /** the usage line's parts; empty hides it */
  usage: string[]
  onScopeCheck: () => void
  onScopeEdit: () => void
}

const CARD = 15
const SVG_SIZE = 44
const USES = ['adopted', 'adapted', 'rejected', 'info'] as const
// One key per button while the pane holds the keyboard (/cw:pane focuses it).
const USE_HOTKEY: Readonly<Record<(typeof USES)[number], string>> = { adopted: 'a', adapted: 'd', rejected: 'x', info: 'i' }

/** Subagents don't report how far they are: the bar fills with each step and only completes when done. */
const reviewBar = (review: Review | undefined, width: number) => {
  const steps = review?.steps ?? 0
  const filled = review?.isDone ? width : Math.min(width - 1, Math.round(width * (1 - Math.exp(-steps / 6))))
  return '▰'.repeat(filled) + '▱'.repeat(width - filled)
}

const bar = (value: number, max: number, width: number) => {
  const filled = max <= 0 ? 0 : Math.max(0, Math.min(width, Math.round((value / max) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function sprite($: $, e: RenderInput, persona: Persona) {
  if (e.surface === 'terminal') {
    const { Raster } = $.ui.resolve(e)
    const raster = rasterCells(persona)
    return <Raster key={`sprite-${persona.id}`} columns={raster.columns} rows={raster.rows} cells={raster.cells} />
  }
  if (e.surface === 'desktop' || e.surface === 'vscode') {
    const { Svg } = $.ui.resolve(e)
    return <Svg source={svgSource(persona)} alt={persona.name} width={SVG_SIZE} height={SVG_SIZE} />
  }
  return null
}

export function drawPane($: $, e: RenderInput, props: PaneProps) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const { snapshot, tab } = props
  const columns = Math.max(CARD, props.columns)

  if (snapshot.paper === null) {
    return (
      <Box flexDirection="column">
        <Text weight="bold">CoWriting</Text>
        <Text dimColor>No paper here yet. Open one with /cw:paper &lt;path&gt;</Text>
        <Text dimColor>(/cw:paper alone lists recent ones), or set one up with /cw:init.</Text>
      </Box>
    )
  }

  const { paper, stats, progress } = snapshot
  const tabs: Tab[] = props.isGame ? ['party', 'live', 'log', 'scope', 'progress'] : ['party', 'live', 'log', 'scope']
  const tabLabel = (t: Tab) =>
    t === 'party'
      ? 'Party'
      : t === 'live'
        ? props.watch.isOn ? 'Live 👁' : 'Live'
        : t === 'log'
          ? `Log (${stats.unannotated})`
          : t === 'scope'
            ? snapshot.scope === null ? 'Scope' : `Scope ${pct(snapshot.scope.overall)}`
            : 'Progress'

  const header = (
    <Box flexDirection="column">
      <Text weight="bold">
        ✍ {paper.name} <Text dimColor>· {paper.format} · {paper.language} · assist-only</Text>
      </Text>
      <Box flexDirection="row">
        {tabs.map((t, i) => (
          <Button
            key={`tab-${t}`}
            label={`${t === tab ? '▸ ' : ''}${tabLabel(t)}`}
            hotkey={String(i + 1)}
            variant={t === tab ? 'primary' : 'secondary'}
            onPress={() => props.onTab(t)}
          />
        ))}
        <Button key="refresh" label="↻" hotkey="r" onPress={props.onRefresh} />
      </Box>
      <Text dimColor>
        keys {tabs.map((t, i) => `${i + 1} ${t}`).join(' · ')} · r refresh · Esc back to prompt
      </Text>
      {props.usage.length > 0 && <Text dimColor>⏱ {props.usage.join(' · ')}</Text>}
    </Box>
  )

  if (tab === 'live') {
    const { watch } = props
    const latest = watch.hints[0]
    const names = watch.personas.map(id => personaById(id)?.name ?? id).join(', ')
    return (
      <Box flexDirection="column">
        {header}
        <Text>
          {watch.isOn ? '👁 Watching your manuscript' : 'Live review is off'} <Text dimColor>· {watch.status}</Text>
        </Text>
        {watch.isOn && <Text dimColor>Watching: {names}</Text>}
        <Text dimColor>
          Pause writing for about 20 s and the changed paragraphs get up to 3 short hints. Max one review a minute and 20 an
          hour. Every review is logged.
        </Text>
        <Button key="watch-toggle" label={watch.isOn ? 'Stop watching' : 'Start watching'} hotkey="w" onPress={props.onWatchToggle} />
        {watch.hints.length === 0 && <Text dimColor>No hints yet. Start with /cw:watch, then write.</Text>}
        {watch.hints.map((hint, i) => (
          <Text key={`hint-${i}`} dimColor={hint.ref !== latest?.ref}>
            <Text weight="bold">{personaById(hint.persona)?.name ?? hint.persona}</Text> <Text dimColor>{hint.file}:{hint.line}</Text> {hint.text}
          </Text>
        ))}
        {latest !== undefined && (
          <Box flexDirection="row">
            <Text dimColor>Latest hints: </Text>
            {USES.map(use => (
              <Button key={`live-${use}`} label={USE_LABELS[use].button} hotkey={USE_HOTKEY[use]} onPress={() => props.onAnnotate(latest.ref, use)} />
            ))}
          </Box>
        )}
      </Box>
    )
  }

  if (tab === 'log') {
    const categories = Object.entries(stats.byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `${c} ${n}`)
      .join(' · ')
    return (
      <Box flexDirection="column">
        {header}
        <Text>
          AI turns: {stats.turns} (today {stats.today}) · unannotated:{' '}
          <Text color={stats.unannotated > 0 ? 'warning' : 'success'}>{stats.unannotated}</Text>
        </Text>
        {categories !== '' && <Text dimColor>{categories}</Text>}
        {stats.aiText > 0 && (
          <Text color="error">⚠ {stats.aiText} answer(s) with AI-written text: disclose them.</Text>
        )}
        {snapshot.nudge !== null && <Text color="warning">🛡 {snapshot.nudge}</Text>}
        <Text weight="bold">Recent</Text>
        {stats.recent.length === 0 && <Text dimColor>Nothing logged yet.</Text>}
        {stats.recent.map(r => (
          <Text key={`turn-${r.id}`} dimColor={!r.isOpen}>
            {r.isOpen ? '•' : '✓'} {r.ts.slice(5, 16).replace('T', ' ')} [{r.category}]
            {r.isAiText ? ' [AI-TEXT]' : ''} {r.preview.slice(0, Math.max(10, columns - 30))}
          </Text>
        ))}
        {stats.open.length > 0 && (
          <Box flexDirection="column">
            <Text weight="bold">To classify: did you use it in your own text?</Text>
            <Text dimColor>{USES.map(use => `${USE_LABELS[use].button} = ${USE_LABELS[use].meaning}`).join(' · ')}</Text>
            {stats.open.slice(0, 3).map((turn, i) => classifyCard($, e, turn, i === 0, props.onAnnotate, columns))}
          </Box>
        )}
      </Box>
    )
  }

  if (tab === 'scope') {
    return (
      <Box flexDirection="column">
        {header}
        {drawScope($, e, snapshot.scope, columns, props.onScopeCheck, props.onScopeEdit)}
      </Box>
    )
  }

  if (tab === 'progress' && progress !== null) {
    const floor = xpForLevel(progress.level)
    return (
      <Box flexDirection="column">
        {header}
        <Text weight="bold">Level {progress.level}</Text>
        <Text>
          {bar(progress.xp - floor, progress.nextLevelXp - floor, Math.min(30, columns - 12))} {progress.xp} XP
        </Text>
        <Text dimColor>
          Writing {progress.writerXp} XP ({progress.ownWords} own words) · Transparency {progress.integrityXp} XP
        </Text>
        <Text>🔥 Streak: {progress.streak} day(s)</Text>
        <Text weight="bold">Achievements</Text>
        {ACHIEVEMENTS.map(a => {
          const has = progress.game.achievements.includes(a.id)
          return (
            <Text key={`ach-${a.id}`} dimColor={!has}>
              {has ? '🏆' : '·'} {a.title} <Text dimColor>– {a.detail}</Text>
            </Text>
          )
        })}
        <Text dimColor>XP comes from your own words and from transparency, never from AI use.</Text>
      </Box>
    )
  }

  const perRow = Math.max(1, Math.floor(columns / CARD))
  const rows: Persona[][] = []
  for (let i = 0; i < props.personas.length; i += perRow) rows.push(props.personas.slice(i, i + perRow))

  return (
    <Box flexDirection="column">
      {header}
      <Text dimColor>
        click a name to summon · 📋 briefed for this project (party.md) · /cw:brief &lt;persona&gt; · /cw:ask &lt;persona&gt; &lt;question&gt;
      </Text>
      {rows.map((row, i) => (
        <Box key={`row-${i}`} flexDirection="row">
          {row.map(p => {
            const level = progress?.personaLevels[p.id] ?? 1
            const consults = stats.personaConsults[p.id] ?? 0
            const running = props.reviews.find(r => r.persona === p.id && !r.isDone)
            return (
              <Box key={`card-${p.id}`} flexDirection="column" width={CARD}>
                {sprite($, e, p)}
                <Button key={`summon-${p.id}`} plain onPress={() => props.onSummon(p.id)}>
                  <Text weight="bold">{p.short}</Text>
                </Button>
                {running !== undefined ? (
                  <Text color="warning">{reviewBar(running, 8)}</Text>
                ) : (
                  <Text dimColor>
                    {props.isGame ? `Lv${level} · ` : ''}
                    {consults}×{snapshot.briefed.includes(p.id) ? ' · 📋' : ''}
                  </Text>
                )}
              </Box>
            )
          })}
        </Box>
      ))}
    </Box>
  )
}

const pct = (n: number) => `${Math.round(n * 100)} %`

const POINT_ICON: Record<string, string> = { covered: '✓', partial: '◐', missing: '○' }
const pointIcon = (p: ScopePoint) => (p.isTicked ? '☑' : POINT_ICON[p.status ?? ''] ?? '·')

const countText = (label: string, c: Count) => (c.target === undefined ? `${label} ${c.done}` : `${label} ${c.done}/${c.target}`)

/** The Scope tab: the author's plan against what the manuscript has so far. */
function drawScope($: $, e: RenderInput, scope: ScopeProgress | null, columns: number, onCheck: () => void, onEdit: () => void) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const width = Math.max(10, Math.min(30, columns - 26))
  if (scope === null) {
    return (
      <Box flexDirection="column">
        <Text>No scope yet.</Text>
        <Text dimColor>
          Describe in scope.md what the paper should achieve: the goal, the points to make, words or pages, figures, tables,
          references, sections and the deadline. Then this tab shows how far you are.
        </Text>
        <Button key="scope-edit" label="Set the scope with me" hotkey="e" onPress={onEdit} />
      </Box>
    )
  }
  const covered = scope.points.filter(p => p.isTicked || p.status === 'covered').length
  const partial = scope.points.filter(p => !p.isTicked && p.status === 'partial').length
  const line = (label: string, value: number, note = '') => (
    <Text key={`scope-bar-${label}`}>
      {label.padEnd(9)}
      {bar(value, 1, width)} {pct(value)}
      <Text dimColor>{note}</Text>
    </Text>
  )
  return (
    <Box flexDirection="column">
      {scope.goal !== '' && (
        <Text>
          🎯 <Text dimColor>{scope.goal.replace(/\s+/g, ' ').slice(0, Math.max(30, columns * 2 - 10))}</Text>
        </Text>
      )}
      {line('≈ Overall', scope.overall, ' estimate')}
      {line('Content', scope.content, ' points and quantities')}
      {scope.finish === null ? (
        <Text dimColor>Finish   set the stage of each section in scope.md (outline, draft, revised, final) for an estimate</Text>
      ) : (
        line('Finish', scope.finish, ` stages${scope.markers > 0 ? ` · ${scope.markers} open markers` : ''}`)
      )}
      <Text>
        {countText('Words', scope.words)} · {countText('Figures', scope.figures)} · {countText('Tables', scope.tables)} ·{' '}
        {countText('References', scope.references)}
      </Text>
      {scope.daysLeft !== undefined && (
        <Text color={scope.daysLeft < 0 ? 'error' : scope.daysLeft < 14 ? 'warning' : undefined}>
          ⏳ {scope.deadline}: {scope.daysLeft < 0 ? `${-scope.daysLeft} days past` : `${scope.daysLeft} days left`}
          {scope.wordsPerDay !== undefined && scope.wordsPerDay > 0 ? ` · ${scope.wordsPerDay} words a day to reach the target` : ''}
        </Text>
      )}
      {scope.points.length > 0 && (
        <Box flexDirection="column">
          <Text weight="bold">
            Points {covered}/{scope.points.length}
            {partial > 0 ? ` (+${partial} partial)` : ''}{' '}
            <Text dimColor>
              {scope.checkedAt === undefined ? '· not checked yet' : `· checked ${scope.checkedAt.slice(5, 16).replace('T', ' ')} UTC`}
            </Text>
          </Text>
          {scope.points.map((p, i) => (
            <Text key={`point-${i}`} dimColor={p.isTicked || p.status === 'covered'}>
              {pointIcon(p)} {p.text.slice(0, Math.max(20, columns - 30))}
              <Text dimColor>
                {p.where ? ` · ${p.where.replace(/^manuscript\//, '')}` : ''}
                {p.note && !p.isTicked ? ` · ${p.note}` : ''}
              </Text>
            </Text>
          ))}
        </Box>
      )}
      {scope.sections.length > 0 && (
        <Box flexDirection="column">
          <Text weight="bold">Sections</Text>
          {scope.sections.map((s, i) => (
            <Text key={`section-${i}`} dimColor={!s.isFound}>
              {s.name.slice(0, 16).padEnd(17)}
              {s.target === undefined ? `${s.words} words`.padEnd(12) : `${bar(s.words, s.target, 8)} ${s.words}/${s.target}`}
              <Text dimColor>
                {s.stage ? ` · ${s.stage}` : ''}
                {s.markers > 0 ? ` · ${s.markers} open` : ''}
                {!s.isFound ? ' · no heading yet' : ''}
              </Text>
            </Text>
          ))}
        </Box>
      )}
      <Box flexDirection="row">
        <Button key="scope-check" label="Check points" hotkey="c" onPress={onCheck} />
        <Button key="scope-edit" label="Edit scope" hotkey="e" onPress={onEdit} />
      </Box>
      <Text dimColor>
        Counted from your text without AI; points are checked by a small model on request (logged). ☑ ticked by you · ✓ covered
        · ◐ partial · ○ missing. Overall = 70 % content + 30 % finish: an estimate.
      </Text>
    </Box>
  )
}

const whoSaid = (turn: RecentTurn) => (turn.persona !== undefined ? personaById(turn.persona)?.name ?? turn.persona : 'Claude')

/** One AI input to classify: who said it, what you asked, what it said, and the four choices. */
function classifyCard($: $, e: RenderInput, turn: RecentTurn, isFirst: boolean, onAnnotate: (ref: string, use: string) => void, columns: number) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const width = Math.max(20, columns - 14)
  const asked = turn.origin === 'agent' ? `its report on your text` : `“${turn.preview}”`
  return (
    <Box key={`classify-${turn.id}`} flexDirection="column">
      <Text>
        <Text weight="bold">{whoSaid(turn)}</Text>{' '}
        <Text dimColor>
          · {turn.ts.slice(5, 16).replace('T', ' ')} · {turn.category}
        </Text>
      </Text>
      <Text dimColor>  you asked: {asked.slice(0, width)}</Text>
      <Text>  it said: {(turn.answer || '(no text)').slice(0, width * 2)}</Text>
      <Box flexDirection="row">
        {USES.map(use => (
          <Button
            key={`use-${turn.id}-${use}`}
            label={USE_LABELS[use].button}
            hotkey={isFirst ? USE_HOTKEY[use] : undefined}
            onPress={() => onAnnotate(turn.id, use)}
          />
        ))}
      </Box>
    </Box>
  )
}

/** Claude Code's own step, as one dim line (calm) or nothing (focus). */
export function drawToolLine($: $, e: RenderInput, props: { label: string; isRunning: boolean; isHidden: boolean }) {
  const { Box, Text } = $.ui.resolve(e)
  if (props.isHidden) return <Box />
  return (
    <Text dimColor>
      · {props.label}
      {props.isRunning ? ' …' : ''}
    </Text>
  )
}

/** The turn's closing line while personas are still at work. */
export function drawWaiting($: $, e: RenderInput, names: readonly string[]) {
  const { Text } = $.ui.resolve(e)
  return <Text dimColor>⏳ waiting for {names.join(', ')}…</Text>
}

type ReviewRowProps = { persona: Persona; review: Review | undefined; isFailed: boolean }

/** A persona's Agent call in the transcript: one line with a progress bar. */
export function drawReviewRow($: $, e: RenderInput, props: ReviewRowProps) {
  const { Box, Text } = $.ui.resolve(e)
  const { persona, review, isFailed } = props
  const steps = review?.steps ?? 0
  const status = isFailed ? 'stopped' : review?.isDone ? `done · ${steps} steps` : `${steps} steps · ${review?.lastStep ?? 'starting'}`
  return (
    <Box flexDirection="row">
      <Text>
        🎭 <Text weight="bold">{persona.name}</Text>{' '}
      </Text>
      <Text color={isFailed ? 'error' : review?.isDone ? 'success' : 'warning'}>{reviewBar(review, 12)}</Text>
      <Text dimColor> {status}</Text>
    </Box>
  )
}

type LiveBandProps = {
  watch: WatchState
  onAnnotate: (ref: string, use: string) => void
  onHide: () => void
}

/** The newest live hints, above the prompt, where the author looks between sentences. */
export function drawLiveBand($: $, e: RenderInput, props: LiveBandProps) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const ref = props.watch.hints[0]?.ref
  const latest = props.watch.hints.filter(one => one.ref === ref)
  return (
    <Box flexDirection="column">
      {latest.map((hint, i) => (
        <Text key={`band-hint-${i}`}>
          👁 <Text weight="bold">{personaById(hint.persona)?.name ?? hint.persona}</Text> <Text dimColor>{hint.file}:{hint.line}</Text> {hint.text}
        </Text>
      ))}
      <Box flexDirection="row">
        {ref !== undefined &&
          USES.map(use => (
            <Button key={`band-live-${use}`} label={USE_LABELS[use].button} onPress={() => props.onAnnotate(ref, use)} />
          ))}
        <Button key="band-live-hide" label="Hide" role="dismiss" onPress={props.onHide} />
      </Box>
    </Box>
  )
}

type BandProps = {
  snapshot: Snapshot
  onAnnotate: (ref: string, use: string) => void
  onHide: () => void
}

export function drawBand($: $, e: RenderInput, props: BandProps) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const { stats } = props.snapshot
  const open = stats.open[0]
  const message = props.snapshot.lastWasAiText
    ? 'The last answer contains AI-written text: it is logged for your disclosure.'
    : props.snapshot.nudge ?? `${stats.unannotated} AI inputs to classify. Did you use this one in your text?`
  return (
    <Box flexDirection="column">
      <Text color="warning">🛡 {message}</Text>
      {open !== undefined && (
        <Text>
          {'   '}
          <Text weight="bold">{whoSaid(open)}:</Text> <Text dimColor>“{open.answer.slice(0, 110)}”</Text>
        </Text>
      )}
      <Box flexDirection="row">
        {open !== undefined &&
          USES.map(use => (
            <Button key={`band-${use}`} label={USE_LABELS[use].button} onPress={() => props.onAnnotate(open.id, use)} />
          ))}
        <Button key="band-hide" label="Hide" role="dismiss" onPress={props.onHide} />
      </Box>
    </Box>
  )
}
