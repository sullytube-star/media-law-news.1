import Anthropic from '@anthropic-ai/sdk'
import { XMLParser } from 'fast-xml-parser'
import { desc, eq, inArray } from 'drizzle-orm'
import { extractText, getDocumentProxy } from 'unpdf'
import { db } from '../../db/index.js'
import { caseRuns, cases } from '../../db/schema.js'

// Keeps the "Key Cases & Precedents" database current.
//
// Each run:
//  1. Searches CourtListener (Free Law Project) for recent opinions from the
//     U.S. Supreme Court and the federal courts of appeals that mention the
//     site's practice areas.
//  2. Looks up each new opinion's PDF in the courts' own opinion feeds.
//  3. Has Claude read the opinion, decide whether it really is a media /
//     speech / entertainment / defamation / privacy ruling, and write the
//     holding, impact and key issues.
// Everything examined is saved so nothing is processed twice.

export type Category = 'first-amendment' | 'media-law' | 'entertainment' | 'defamation-privacy'

export const CATEGORY_LABELS: Record<Category, string> = {
  'first-amendment': 'First Amendment',
  'media-law': 'Media Law',
  entertainment: 'Entertainment Law',
  'defamation-privacy': 'Defamation & Privacy',
}

const COURTS = ['scotus', 'ca1', 'ca2', 'ca3', 'ca4', 'ca5', 'ca6', 'ca7', 'ca8', 'ca9', 'ca10', 'ca11', 'cadc', 'cafc']

const SEARCHES = [
  '"first amendment" AND (speech OR press OR expressive OR expression OR censorship)',
  '"freedom of the press" OR journalist OR "news media" OR "section 230" OR "reporter\'s privilege" OR "prior restraint"',
  '(copyright OR trademark OR "right of publicity") AND (music OR film OR television OR "motion picture" OR song OR studio OR artist OR video game OR streaming)',
  'defamation OR libel OR slander OR "anti-SLAPP" OR "invasion of privacy" OR "false light" OR "video privacy protection act"',
]

const MAX_AGE_DAYS = 45 // ignore opinions older than this
const MAX_PER_RUN = 12 // opinions read by Claude per run
const MIN_RUN_GAP_MS = 60 * 60 * 1000
const MAX_PDF_BYTES = 20 * 1024 * 1024
const MAX_TEXT_CHARS = 90_000
const MODEL = 'claude-sonnet-5-5'
const UA = 'MediaLawNews/1.0 (+https://medialawnews.com)'

type Candidate = { sourceUrl: string; title: string; court: string; dateFiled: string; pdfUrl?: string }

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'entry' || name === 'link',
})

function text(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return text(value[0])
  if (typeof value === 'object') return text((value as Record<string, unknown>)['#text'])
  return String(value)
}

async function fetchFeed(url: string): Promise<any[]> {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const entries = parser.parse(await res.text())?.feed?.entry
  return Array.isArray(entries) ? entries : []
}

function toCandidate(entry: any): Candidate | null {
  const links: any[] = entry.link ?? []
  const page = links.find((l) => l['@_rel'] === 'alternate')?.['@_href'] ?? text(entry.id)
  const pdf = links.find((l) => l['@_rel'] === 'enclosure' && /pdf/i.test(l['@_type'] ?? ''))?.['@_href']
  const published = new Date(text(entry.published))
  const title = text(entry.title).replace(/\s+/g, ' ').trim()
  if (!/^https:\/\/www\.courtlistener\.com\/opinion\//.test(page) || !title || Number.isNaN(published.getTime())) return null
  return {
    sourceUrl: page,
    title,
    court: text(entry.author?.name).trim() || 'Federal court',
    // Feed dates are midnight Pacific; keep the calendar date as published.
    dateFiled: text(entry.published).slice(0, 10),
    pdfUrl: pdf && /^https:\/\/storage\.courtlistener\.com\//.test(pdf) ? pdf : undefined,
  }
}

export async function findCandidates(): Promise<{ candidates: Candidate[]; errors: string[] }> {
  const errors: string[] = []
  const court = COURTS.join(' ')
  const searchUrls = SEARCHES.map(
    (q) =>
      `https://www.courtlistener.com/feed/search/?type=o&order_by=dateFiled%20desc&court=${encodeURIComponent(court)}&q=${encodeURIComponent(q)}`
  )
  const courtUrls = COURTS.map((c) => `https://www.courtlistener.com/feed/court/${c}/`)

  const load = (url: string) =>
    fetchFeed(url).catch((e) => {
      errors.push(e instanceof Error ? e.message : String(e))
      return []
    })
  const [searchResults, courtResults] = await Promise.all([
    Promise.all(searchUrls.map(load)),
    Promise.all(courtUrls.map(load)),
  ])

  // Search feeds don't include the PDF link; the per-court feeds do.
  const pdfByPage = new Map<string, string>()
  for (const entry of courtResults.flat()) {
    const c = toCandidate(entry)
    if (c?.pdfUrl) pdfByPage.set(c.sourceUrl, c.pdfUrl)
  }

  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 86_400_000).toISOString().slice(0, 10)
  const byUrl = new Map<string, Candidate>()
  for (const entry of searchResults.flat()) {
    const c = toCandidate(entry)
    if (!c || c.dateFiled < cutoff || byUrl.has(c.sourceUrl)) continue
    c.pdfUrl ??= pdfByPage.get(c.sourceUrl)
    byUrl.set(c.sourceUrl, c)
  }
  const candidates = [...byUrl.values()].sort((a, b) => b.dateFiled.localeCompare(a.dateFiled))
  return { candidates, errors }
}

// CourtListener stores PDFs at /pdf/YYYY/MM/DD/<case_name>.pdf, where the
// case name is lower-cased with spaces turned into underscores, most
// punctuation other than "." and "-" dropped, and long names cut at a word.
function pdfGuesses(c: Candidate): string[] {
  const name = c.title
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9 .\-_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const names = new Set<string>([name])
  for (const max of [75, 80, 74, 76]) {
    if (name.length > max) names.add(name.slice(0, max + 1).replace(/\s+\S*$/, '').trim())
  }
  const day = c.dateFiled.replace(/-/g, '/')
  return [...names].map((n) => `https://storage.courtlistener.com/pdf/${day}/${n.replace(/ /g, '_')}.pdf`)
}

export async function resolvePdf(c: Candidate): Promise<string | undefined> {
  if (c.pdfUrl) return c.pdfUrl
  for (const url of pdfGuesses(c)) {
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10_000) }).catch(
      () => null
    )
    if (res?.ok) return url
  }
  return undefined
}

export async function opinionText(pdfUrl: string): Promise<string> {
  const res = await fetch(pdfUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(45_000) })
  if (!res.ok) throw new Error(`PDF HTTP ${res.status}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  if (buf.byteLength > MAX_PDF_BYTES) throw new Error('PDF too large')
  const pdf = await getDocumentProxy(buf)
  const { text: body } = await extractText(pdf, { mergePages: true })
  const cleaned = String(body).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  if (cleaned.length < 500) throw new Error('No extractable text in PDF')
  return cleaned.length > MAX_TEXT_CHARS
    ? cleaned.slice(0, MAX_TEXT_CHARS * 0.8) + '\n\n[…]\n\n' + cleaned.slice(-MAX_TEXT_CHARS * 0.2)
    : cleaned
}

type Review = {
  question_decided?: string
  relevant: boolean
  category?: Category
  citation?: string
  holding?: string
  impact?: string
  issues?: string[]
}

const REVIEW_TOOL: Anthropic.Tool = {
  name: 'record_case',
  description: 'Record whether this opinion belongs in the media law case database and, if so, its summary.',
  input_schema: {
    type: 'object',
    properties: {
      question_decided: {
        type: 'string',
        description:
          'In one sentence, the free speech, press, media, entertainment-industry IP, defamation or privacy question the court actually decided in this opinion — or "none" if it decided no such question.',
      },
      relevant: {
        type: 'boolean',
        description:
          'True only if question_decided names a real question in one of the categories that the court resolved with legal analysis. Must be false when question_decided is "none"; when the topic appears only in passing, in a string cite, or in a claim dismissed without analysis; for short orders or unpublished memoranda with no real analysis; and for cases that are only about the religion clauses, prisoners\' medical care, immigration, criminal procedure, ordinary contracts or patents.',
      },
      category: {
        type: 'string',
        enum: Object.keys(CATEGORY_LABELS),
        description:
          'first-amendment: free speech/expression doctrine. media-law: press, journalists, broadcasters, platforms, Section 230, newsgathering, public records. entertainment: copyright, trademark, right of publicity or contracts in music, film, TV, games, publishing, sports media. defamation-privacy: defamation, libel, anti-SLAPP, privacy torts and privacy statutes.',
      },
      citation: {
        type: 'string',
        description: 'Reporter citation if printed on the opinion, otherwise the docket number, e.g. "No. 24-1234 (9th Cir. 2026)".',
      },
      holding: { type: 'string', description: 'At most 3 short plain-English sentences (under 90 words) stating what the court held and why.' },
      impact: { type: 'string', description: 'One or two sentences (under 50 words) on why it matters to media, speech or entertainment lawyers.' },
      issues: { type: 'array', items: { type: 'string' }, description: '2–4 short key-issue tags, Title Case.' },
    },
    required: ['question_decided', 'relevant'],
  },
}

export async function review(anthropic: Anthropic, c: Candidate, body: string): Promise<Review> {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    tools: [REVIEW_TOOL],
    system:
      'You maintain a case database for a media law news site covering First Amendment, media law, entertainment law, defamation and privacy. ' +
      'Always respond by calling the record_case tool exactly once. ' +
      'Summaries must be accurate and based only on the opinion text provided — never guess. Describe what the court actually decided (affirmed, reversed, remanded), not the parties\' arguments.',
    messages: [
      {
        role: 'user',
        content: `Case: ${c.title}\nCourt: ${c.court}\nDate filed: ${c.dateFiled}\n\nOpinion text:\n<opinion>\n${body}\n</opinion>`,
      },
    ],
  })
  const block = msg.content.find((b) => b.type === 'tool_use')
  if (!block || block.type !== 'tool_use') throw new Error('No review returned')
  const r = block.input as Review
  const ok = r.relevant && !/^\s*none\b/i.test(r.question_decided ?? '') && r.category && r.category in CATEGORY_LABELS && r.holding
  return ok ? r : { relevant: false }
}

export type RunResult = { skipped?: string; examined: number; added: number; candidates: number; errors: string[] }

export async function collectCases(): Promise<RunResult> {
  const [last] = await db.select().from(caseRuns).orderBy(desc(caseRuns.startedAt)).limit(1)
  if (last && Date.now() - last.startedAt.getTime() < MIN_RUN_GAP_MS) {
    return { skipped: 'ran less than an hour ago', examined: 0, added: 0, candidates: 0, errors: [] }
  }
  const [run] = await db.insert(caseRuns).values({}).returning()

  const { candidates, errors } = await findCandidates()
  const seen = candidates.length
    ? new Set(
        (
          await db
            .select({ url: cases.sourceUrl })
            .from(cases)
            .where(inArray(cases.sourceUrl, candidates.map((c) => c.sourceUrl)))
        ).map((r) => r.url)
      )
    : new Set<string>()
  // Opinions whose PDF can't be found yet are left for a later run.
  const todo: Candidate[] = []
  for (const c of candidates) {
    if (todo.length >= MAX_PER_RUN) break
    if (seen.has(c.sourceUrl)) continue
    c.pdfUrl = await resolvePdf(c)
    if (c.pdfUrl) todo.push(c)
  }

  const anthropic = new Anthropic()
  let added = 0
  let examined = 0
  for (const c of todo) {
    try {
      const r = await review(anthropic, c, await opinionText(c.pdfUrl!))
      examined++
      await db
        .insert(cases)
        .values({
          sourceUrl: c.sourceUrl,
          pdfUrl: c.pdfUrl,
          title: c.title,
          court: c.court,
          dateFiled: c.dateFiled,
          relevant: r.relevant,
          category: r.relevant ? r.category : null,
          citation: r.relevant ? r.citation?.trim() || null : null,
          holding: r.relevant ? r.holding!.trim() : null,
          impact: r.relevant ? r.impact?.trim() || null : null,
          issues: r.relevant ? (r.issues ?? []).map((i) => i.trim()).filter(Boolean).slice(0, 4) : [],
        })
        .onConflictDoNothing({ target: cases.sourceUrl })
      if (r.relevant) added++
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      errors.push(`${c.title}: ${message}`)
      console.warn(`[cases] could not process ${c.sourceUrl}: ${message}`)
    }
  }

  const summary = `${candidates.length} candidates, ${examined} read, ${added} added`
  await db.update(caseRuns).set({ examined: summary }).where(eq(caseRuns.id, run.id))
  return { examined, added, candidates: candidates.length, errors }
}

export async function listRecentCases(limit = 60) {
  const rows = await db
    .select({
      id: cases.id,
      title: cases.title,
      court: cases.court,
      dateFiled: cases.dateFiled,
      category: cases.category,
      citation: cases.citation,
      holding: cases.holding,
      impact: cases.impact,
      issues: cases.issues,
      sourceUrl: cases.sourceUrl,
      pdfUrl: cases.pdfUrl,
    })
    .from(cases)
    .where(eq(cases.relevant, true))
    .orderBy(desc(cases.dateFiled), desc(cases.id))
    .limit(limit)
  return rows.map((r) => ({ ...r, categoryLabel: CATEGORY_LABELS[r.category as Category] ?? 'Media Law' }))
}

export async function lastRunAt(): Promise<Date | null> {
  const [last] = await db.select({ at: caseRuns.startedAt }).from(caseRuns).orderBy(desc(caseRuns.startedAt)).limit(1)
  return last?.at ?? null
}
