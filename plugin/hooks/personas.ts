// The review party: one persona per perspective on a paper. The catalogue
// below ships with the plugin: each has a subagent of the same id in
// plugin/agents/<id>.md and a 12x12 sprite drawn from a palette ('.' is
// transparent; the shared palette is extended by each persona's own colours).
// The author picks the members of their paper's party from it and adds
// experts of their own as party/<id>.md files, registered as cowrite:<id> agents
// when the paper is opened.

export type Persona = {
  id: string
  name: string
  /** what the compact party card shows, at most 13 characters */
  short: string
  role: string
  category: string
  /** 'catalog': ships with the plugin; 'custom': a party/<id>.md file of this paper */
  source: 'catalog' | 'custom'
  palette: Readonly<Record<string, string>>
  sprite: readonly string[]
}

export const SHARED_PALETTE: Readonly<Record<string, string>> = {
  K: '#1b1b1f',
  S: '#f2c9a0',
  W: '#f4f4f4',
  m: '#b0544f',
  P: '#2d3a55',
  G: '#3a3a3a',
  L: '#9fd3ff',
}

export const PERSONAS: readonly Persona[] = [
  {
    id: 'grammar-guy',
    name: 'Grammar Guy',
    short: 'Grammar Guy',
    role: 'Grammar, spelling, punctuation (EN/DE)',
    category: 'language',
    source: 'catalog',
    palette: { H: '#6b4226', C: '#3b6fd6', R: '#e03c31' },
    sprite: [
      '....HHHH....',
      '...HHHHHH...',
      '..HHHHHHHH..',
      '..HSSSSSSH..',
      '..SKSSSSKS..',
      '..SSSSSSSS..',
      '...SSmmSS...',
      '....SSSS....',
      '..CCCCCCCCR.',
      '.CCCCCCCCCR.',
      '.SCCCCCCCSR.',
      '..PPP..PPP..',
    ],
  },
  {
    id: 'statistics-nerd',
    name: 'Statistics Nerd',
    short: 'Stats Nerd',
    role: 'Design, tests, effect sizes, reporting',
    category: 'methods',
    source: 'catalog',
    palette: { H: '#111111', C: '#2e9e5b' },
    sprite: [
      '...H.HH.H...',
      '...HHHHHH...',
      '..HHHHHHHH..',
      '..HSSSSSSH..',
      '..GLGGGGLG..',
      '..SSSSSSSS..',
      '...SSmmSS...',
      '....SSSS....',
      '..CCCCCCCC..',
      '.CCCCWWCCCC.',
      '.SCCWCCWCCS.',
      '..PPP..PPP..',
    ],
  },
  {
    id: 'reviewer-2',
    name: 'Reviewer #2',
    short: 'Reviewer #2',
    role: 'Weaknesses, limitations, tough questions',
    category: 'feedback',
    source: 'catalog',
    palette: { H: '#9a9a9a', C: '#2f2f3a', T: '#c0392b', Y: '#f1c40f' },
    sprite: [
      '............',
      '...HHHHHH...',
      '..HHHHHHHH..',
      '..HSSSSSSH..',
      '..SKKSSKKS..',
      '..SSSSSSSS..',
      '...SKKKKS...',
      '....SSSS....',
      '..CCWTWCCC..',
      '.CYCCTCCCCC.',
      '.SCCCTCCCCS.',
      '..PPP..PPP..',
    ],
  },
  {
    id: 'librarian',
    name: 'The Librarian',
    short: 'Librarian',
    role: 'Sources, Zotero, Obsidian, DOI checks',
    category: 'literature',
    source: 'catalog',
    palette: { H: '#a0522d', C: '#7d5ba6', B: '#8b5a2b' },
    sprite: [
      '.....HH.....',
      '....HHHH....',
      '...HHHHHH...',
      '..HHSSSSHH..',
      '..GLGGGGLG..',
      '..HSSSSSSH..',
      '..HSSmmSSH..',
      '....SSSS....',
      '..CCCCCCCC..',
      '.CCBBBBCCCC.',
      '.SCBWWBCCCS.',
      '..PPP..PPP..',
    ],
  },
  {
    id: 'architect',
    name: 'The Architect',
    short: 'Architect',
    role: 'Structure, argument flow, red thread',
    category: 'structure',
    source: 'catalog',
    palette: { H: '#4b3621', Y: '#f5b700', O: '#ff7a1a', B: '#4a90d9' },
    sprite: [
      '....YYYY....',
      '...YYYYYY...',
      '..YYYYYYYY..',
      '..HSSSSSSH..',
      '..SKSSSSKS..',
      '..SSSSSSSS..',
      '...SSmmSS...',
      '....SSSS....',
      '..OOOOOOOOB.',
      '.OWOOOOOWOB.',
      '.SOOOOOOOSB.',
      '..PPP..PPP..',
    ],
  },
  {
    id: 'integrity-guardian',
    name: 'Integrity Guardian',
    short: 'Integrity',
    role: 'Good scientific practice, plagiarism, disclosure',
    category: 'integrity',
    source: 'catalog',
    palette: { M: '#b8c4d0', C: '#1f4e8c', A: '#d4a017', Y: '#fff3b0' },
    sprite: [
      '....MMMM....',
      '...MMMMMM...',
      '..MMMMMMMM..',
      '..MSSSSSSM..',
      '..SKSSSSKS..',
      '..SSSSSSSS..',
      '...SSmmSS...',
      '....SSSS....',
      'AAACCCCCCC..',
      'AYACCCCCCCC.',
      'AAASCCCCCCS.',
      '.A.PPP..PPP.',
    ],
  },
  {
    id: 'lay-reader',
    name: 'The Lay Reader',
    short: 'Lay Reader',
    role: 'Clarity for non-experts',
    category: 'feedback',
    source: 'catalog',
    palette: { H: '#c68642', R: '#e74c3c', C: '#16a085' },
    sprite: [
      '............',
      '...RRRRRR...',
      '..RRRRRRRRR.',
      '..HSSSSSSH..',
      '..SKSSSSKS..',
      '..SSSSSSSS..',
      '...SSmmSS...',
      '....SSSS....',
      '..CCCCCCCC..',
      '.CCCCCCCCCC.',
      '.SCCCCCCCKS.',
      '..PPP..PPP..',
    ],
  },
  {
    id: 'style-coach',
    name: 'The Style Coach',
    short: 'Style Coach',
    role: 'Writing style, compared with papers you admire',
    category: 'style',
    source: 'catalog',
    palette: { B: '#2c2c54', H: '#3d2b1f', R: '#e84393', C: '#f5e6c8' },
    sprite: [
      '......B.....',
      '...BBBBBB...',
      '..BBBBBBBBB.',
      '..HSSSSSSH..',
      '..SKSSSSKS..',
      '..SSSSSSSS..',
      '...SSmmSS...',
      '....SSSS....',
      '..CRRRRRRC..',
      '.CCCCRRCCCC.',
      '.SCCCCRCCCS.',
      '..PPP..PPP..',
    ],
  },
  {
    id: 'terminologist',
    name: 'The Terminologist',
    short: 'Terminologist',
    role: 'Field terminology, usual vs. unusual wording',
    category: 'terminology',
    source: 'catalog',
    palette: { H: '#5d4037', C: '#34495e', B: '#f1c40f', D: '#c0392b', Y: '#d4a017' },
    sprite: [
      '....HHHH....',
      '...HHHHHHH..',
      '..HHHHHHHH..',
      '..HSSSSSSH..',
      '..SKSSSGLG..',
      '..SSSSSSYS..',
      '...SSmmSY...',
      '....SSSS....',
      '..CCCBBCCDD.',
      '.CCCCBBCCDD.',
      '.SCCCCCCCDS.',
      '..PPP..PPP..',
    ],
  },
  {
    id: 'clinician',
    name: 'The Clinician',
    short: 'Clinician',
    role: 'Clinical relevance, patient perspective',
    category: 'content',
    source: 'catalog',
    palette: { H: '#3d2b1f', T: '#1abc9c' },
    sprite: [
      '....HHHH....',
      '...HHHHHH...',
      '..HHHHHHHH..',
      '..HSSSSSSH..',
      '..SKSSSSKS..',
      '..SSSSSSSS..',
      '...SSmmSS...',
      '....SSSS....',
      '..WWKTTKWW..',
      '.WWWKTTKWWW.',
      '.SWWWKKWWWS.',
      '..PPP..PPP..',
    ],
  },
]

/** The party a new paper starts with: the catalogue without its field-specific member. */
export const DEFAULT_PARTY: readonly string[] = PERSONAS.filter(p => p.id !== 'clinician').map(p => p.id)

// ---------------------------------------------------------------- custom personas

/** A persona the author made: party/<id>.md, read when the paper is opened. */
export type CustomPersona = {
  persona: Persona
  /** the agent's whole system prompt: the file's body, then the party's shared rules */
  prompt: string
}

// The experts of the paper the session works on, by id: filled by loadParty().
const customs = new Map<string, Persona>()

export const setCustomPersonas = (list: readonly Persona[]): void => {
  customs.clear()
  for (const p of list) customs.set(p.id, p)
}

export const customPersonas = (): Persona[] => [...customs.values()]

export const personaById = (id: string): Persona | undefined => {
  const key = id.replace(/^(cowrite|cw|cowriting):/, '')
  return PERSONAS.find(p => p.id === key) ?? customs.get(key)
}

/** The members of a paper's party, in the order of its roster, unknown ids left out. */
export const partyPersonas = (ids: readonly string[]): Persona[] =>
  ids.flatMap(id => {
    const p = personaById(id)
    return p === undefined ? [] : [p]
  })

export const PERSONA_ID = /^[a-z0-9][a-z0-9-]{0,62}$/

/** A persona id a party/<id>.md file may have: short, lowercase, not one of the catalogue's. */
export const isCustomId = (id: string): boolean => PERSONA_ID.test(id) && !PERSONAS.some(p => p.id === id)

// Every custom persona wears the same figure; its coat takes the file's colour, its hair one of these.
const HAIR = ['#3d2b1f', '#6b4226', '#111111', '#a0522d', '#9a9a9a', '#c68642', '#4b3621', '#5d4037']
const COATS = ['#1abc9c', '#2e9e5b', '#3b6fd6', '#7d5ba6', '#e67e22', '#c0392b', '#16a085', '#f1c40f']

const GENERIC_SPRITE: readonly string[] = [
  '....HHHH....',
  '...HHHHHH...',
  '..HHHHHHHH..',
  '..HSSSSSSH..',
  '..SKSSSSKS..',
  '..SSSSSSSS..',
  '...SSmmSS...',
  '....SSSS....',
  '..CCCCCCCC..',
  '.CCCCWWCCCC.',
  '.SCCCCCCCCS.',
  '..PPP..PPP..',
]

const hashOf = (text: string): number => {
  let h = 0
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

const COLOUR = /^#[0-9a-fA-F]{6}$/

/** A name's short form for the card: without a leading article, at most 13 characters. */
const shortOf = (name: string): string => name.replace(/^(the|der|die|das)\s+/i, '').slice(0, 13)

/** The lines between the first two "---" lines as key: value pairs, and the text after them. */
const splitFrontmatter = (text: string): { meta: Record<string, string>; body: string } | null => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text.trimStart())
  if (match === null) return null
  const meta: Record<string, string> = {}
  for (const line of match[1]!.split(/\r?\n/)) {
    const pair = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line)
    if (pair === null) continue
    meta[pair[1]!.toLowerCase()] = pair[2]!.trim().replace(/^(['"])(.*)\1$/, '$2')
  }
  return { meta, body: match[2]!.trim() }
}

/** The rules every persona of the party works under; a custom persona's prompt ends with them. */
export const PERSONA_RULES = `## Ground rules (CoWriting, DFG good scientific practice)
- The author writes. You **never** write or rewrite prose meant for the manuscript: no paragraphs, rephrasings, "improved versions", abstracts or introductions. You cannot edit files under \`manuscript/\`; don't try.
- If your task ends with *the author's briefing for you in this project*, that is your focus and your priorities here, within these ground rules. Without one, \`party.md\` in the paper folder may hold it.
- Give **located** feedback (\`file:line\` or a short quote of at most ~10 words), **questions** and **hints**. Explain *why* something is a problem and *what principle* applies, so the author can fix it themselves.
- Never invent facts or references. Cite only what you verified (DOI/URL) or what exists in the bibliography under \`literature/\`; mark anything else \`UNVERIFIED\`.
- Answer in the language of the manuscript (see \`paper.json\`), unless the author writes to you in another language.
- Stay in your perspective; if you notice a problem outside it, name it in one line and which party member to ask.
- A **reply** from the author to feedback you gave earlier (the task says so and quotes that feedback) is a conversation, not a new review: answer it directly, in your voice, as a colleague would. Take a position, give your reasons, concede where the author is right, hold your ground where not, and ask back when something is unclear. The author may tell you how to weigh things in this paper; take that on for this answer, within these rules.

## Output format
Start with one line in character (your voice), then:
1. **Top 3 issues** (most important first): location, what you noticed, why it matters, a guiding question or hint.
2. **Further observations** (short bullet list, optional).
3. **Questions for the author** (1–3).
A reply from the author gets no report: one line in character, then your answer, then the same closing line.
End with: \`→ Annotate this with /cowrite:annotate (adopted / adapted / rejected / info).\``

/** What a custom persona may call: it reads and searches, like the catalogue's reviewers. */
export const CUSTOM_TOOLS: readonly string[] = ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch']

/**
 * A party/<id>.md file as a persona: frontmatter with name, role and optionally short, category and
 * colour (the coat, #rrggbb), then the persona's perspective and voice as its body. Null when the id
 * or the file is not a persona.
 */
export const parsePersonaFile = (id: string, text: string): CustomPersona | null => {
  if (!isCustomId(id)) return null
  const parsed = splitFrontmatter(text)
  if (parsed === null) return null
  const { meta, body } = parsed
  const name = meta.name ?? ''
  const role = meta.role ?? ''
  if (name === '' || role === '' || body === '') return null
  const colour = meta.colour ?? meta.color ?? ''
  const coat = COLOUR.test(colour) ? colour : COATS[hashOf(id) % COATS.length]!
  const persona: Persona = {
    id,
    name,
    short: (meta.short ?? '').slice(0, 13) || shortOf(name),
    role: role.slice(0, 80),
    category: (meta.category ?? '').toLowerCase().replace(/[^a-z-]/g, '') || 'content',
    source: 'custom',
    palette: { H: HAIR[hashOf(name) % HAIR.length]!, C: coat },
    sprite: GENERIC_SPRITE,
  }
  return { persona, prompt: `${body}\n\n${PERSONA_RULES}` }
}

/** The description the model reads in its listing of agent types. */
export const customDescription = (p: Persona): string =>
  `${p.name}, a member of the author's review party: ${p.role}. Use when the author wants this perspective on their text; it gives located hints and questions, never text.`

/** A party/<id>.md skeleton for a new expert, for /cowrite:party new and the init skill. */
export const personaFileSkeleton = (id: string, name: string, role: string): string =>
  [
    '---',
    `name: ${name}`,
    `short: ${shortOf(name)}`,
    `role: ${role}`,
    'category: content',
    `colour: ${COATS[hashOf(id) % COATS.length]!}`,
    '---',
    `You are **${name}**. Your perspective: ${role}.`,
    '',
    '<!-- Describe what this expert looks at and asks, in a few sentences: the questions of the field,',
    '     what counts as evidence there, the mistakes outsiders make, the guidelines that apply. Then a voice line. -->',
    'Voice: (one line in character)',
    '',
  ].join('\n')
