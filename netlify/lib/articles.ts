import { getStore } from '@netlify/blobs'
import { and, desc, eq, inArray, ne, notInArray, or, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { articles } from '../../db/schema.js'
import type { Snapshot } from './feeds.ts'
import { CURATED_STORIES } from './curated.ts'

// Permanent article pages. Existing year/slug assignments are immutable.
export type Article = typeof articles.$inferSelect
export type Topic = 'first-amendment' | 'media-law' | 'entertainment' | 'defamation-privacy'
export type ArchiveCategory = 'media-law' | 'first-amendment' | 'entertainment-law' | 'privacy' | 'defamation' | 'journalism' | 'technology-law' | 'scotus'

export const CATEGORY_LABELS: Record<ArchiveCategory, string> = {
  'media-law': 'Media Law',
  'first-amendment': 'First Amendment',
  'entertainment-law': 'Entertainment Law',
  privacy: 'Privacy',
  defamation: 'Defamation',
  journalism: 'Journalism',
  'technology-law': 'Technology Law',
  scotus: 'SCOTUS',
}

export const ARCHIVE_CATEGORIES = Object.keys(CATEGORY_LABELS) as ArchiveCategory[]

export const TOPIC_LABELS: Record<Topic, string> = {
  'first-amendment': 'First Amendment',
  'media-law': 'Media Law',
  entertainment: 'Entertainment Law',
  'defamation-privacy': 'Defamation & Privacy',
}

const FEED_TOPICS: Record<string, Topic> = {
  'https://www.scotusblog.com/feed/': 'first-amendment',
  'https://firstamendmentwatch.org/feed/': 'first-amendment',
  'https://www.nytimes.com/svc/collections/v1/publish/https://www.nytimes.com/topic/subject/first-amendment-us-constitution/rss.xml': 'first-amendment',
  'https://www.newsweek.com/topic/first-amendment': 'first-amendment',
  'https://www.rcfp.org/feed/': 'media-law',
  'https://www.eff.org/rss/updates.xml': 'media-law',
  'https://epic.org/feed/': 'defamation-privacy',
  'https://www.insideprivacy.com/feed/': 'defamation-privacy',
  'https://eyeonprivacy.sheppardmullinplatform.com/feed/': 'defamation-privacy',
  'https://www.mandellpc.com/news': 'media-law',
  'https://www.courthousenews.com/feed/': 'media-law',
  'https://www.courthousenews.com/category/media/feed/': 'media-law',
  'https://www.courthousenews.com/category/entertainment/feed/': 'entertainment',
  'https://www.courthousenews.com/category/civil-rights/feed/': 'first-amendment',
  'https://www.courthousenews.com/category/appeals/feed/': 'media-law',
}

export function classifyTopic(text: string, fallback: Topic): Topic {
  const t = text.toLowerCase()
  if (/(defamation|libel|slander|privacy|reputation|anti-slapp|false light|intrusion|public disclosure)/.test(t)) return 'defamation-privacy'
  if (/(copyright|trademark|music|film|studio|streaming|hollywood|entertainment|royalt|licens|talent|celebrit)/.test(t)) return 'entertainment'
  if (/(journalist|reporter|press freedom|newsroom|subpoena|foia|public records|section 230)/.test(t)) return 'media-law'
  if (/(first amendment|free speech|free expression|censorship|protest|religious liberty|book ban)/.test(t)) return 'first-amendment'
  return fallback
}

export const CATEGORY_DESCRIPTIONS: Record<ArchiveCategory, string> = {
  'media-law': 'Legal developments affecting publishers, broadcasters, platforms and the news business.',
  'first-amendment': 'Free speech, free press, censorship and prior-restraint cases and commentary.',
  'entertainment-law': 'Copyright, trademark, right of publicity, licensing and disputes across film, music and streaming.',
  privacy: 'Data protection, surveillance, biometrics and the privacy torts.',
  defamation: 'Libel, slander, false light and anti-SLAPP litigation.',
  journalism: 'Press freedom, newsgathering, shield laws, subpoenas and reporters\' rights.',
  'technology-law': 'Section 230, AI, social media, platform regulation and internet law.',
  scotus: 'U.S. Supreme Court cases, arguments and opinions touching media and speech.',
}

const STATES = 'alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|state|india|indian|uk|u\\.k\\.|canada|canadian|israel|israeli|brazil|brazilian|county'
const STATE_COURT = new RegExp(`(${STATES})('s)?\\s+supreme court`, 'gi')

// True when the text refers to the U.S. Supreme Court rather than only a state or foreign high court.
function mentionsScotus(text: string): boolean {
  if (/(scotus|supreme court of the united states|u\.s\. supreme court|us supreme court|united states supreme court|justices? (alito|thomas|roberts|sotomayor|kagan|gorsuch|kavanaugh|barrett|ketanji))/i.test(text)) return true
  const all = text.match(/supreme court/gi)?.length ?? 0
  const state = text.match(STATE_COURT)?.length ?? 0
  return all > state
}

const ARCHIVE_RULES: [ArchiveCategory, RegExp][] = [
  ['first-amendment', /(first amendment|free speech|free expression|freedom of (speech|the press|expression)|censorship|censor(ed|s)?\b|prior restraint|book ban)/i],
  ['entertainment-law', /(entertainment|copyright|trademark|music (industry|label|publisher)|\bfilm|hollywood|streaming|right of publicity|royalt|record label|\bstudio)/i],
  ['privacy', /(privacy|data protection|surveillance|personal data|biometric|facial recognition|gdpr|ccpa|wiretap)/i],
  ['defamation', /(defamation|defamatory|libel|slander|false light|anti-slapp)/i],
  ['journalism', /(journalis|reporters?\b|newsroom|news media|press freedom|freedom of the press|newsgathering|shield law|news organi[sz]ation|foia|public records)/i],
  ['technology-law', /(\btechnology|tech compan|artificial intelligence|\bai\b|generative|social media|section 230|\binternet\b|online platform|algorithm|data breach|deepfake|tiktok|meta platforms|youtube|\bx corp)/i],
  ['media-law', /(media law|media compan|news organi[sz]ation|journalis|\bpress\b|broadcast|\bpublishers?\b|newspaper|\bfcc\b)/i],
]

const TOPIC_CATEGORY: Record<Topic, ArchiveCategory> = {
  'first-amendment': 'first-amendment',
  'media-law': 'media-law',
  entertainment: 'entertainment-law',
  'defamation-privacy': 'privacy',
}

type Categorizable = Pick<Article, 'title' | 'summary' | 'source' | 'topic' | 'categories'>
const categorizableText = (a: Categorizable) => `${a.title} ${a.summary} ${a.source} ${(a.categories || []).join(' ')}`

// Auto-categorizes an article from its headline, summary, source and feed tags.
// Every article lands in at least one archive (the one matching its topic).
export function archiveCategories(article: Categorizable): ArchiveCategory[] {
  const text = categorizableText(article)
  const found = new Set<ArchiveCategory>()
  for (const [category, pattern] of ARCHIVE_RULES) if (pattern.test(text)) found.add(category)
  if (mentionsScotus(text)) found.add('scotus')
  const fallback = TOPIC_CATEGORY[article.topic as Topic] || 'media-law'
  // The combined "defamation & privacy" topic only implies privacy if nothing more specific matched.
  if (fallback !== 'privacy' || !found.has('defamation')) found.add(fallback)
  return ARCHIVE_CATEGORIES.filter((category) => found.has(category))
}

// The single category used for breadcrumbs: the most specific match, preferring the article's topic.
export function primaryCategory(article: Categorizable): ArchiveCategory {
  const cats = archiveCategories(article)
  const topicCat = TOPIC_CATEGORY[article.topic as Topic]
  const priority: ArchiveCategory[] = ['scotus', 'defamation', 'privacy', 'first-amendment', 'entertainment-law', 'technology-law', 'journalism', 'media-law']
  if (topicCat && cats.includes(topicCat) && topicCat !== 'media-law') return topicCat
  return priority.find((c) => cats.includes(c)) || 'media-law'
}

const MAX_SLUG_LENGTH = 80
export function slugify(title: string): string {
  const slug = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/['’‘`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (slug.length <= MAX_SLUG_LENGTH) return slug || 'article'
  const cut = slug.slice(0, MAX_SLUG_LENGTH + 1)
  const boundary = cut.lastIndexOf('-')
  return (boundary > 20 ? cut.slice(0, boundary) : slug.slice(0, MAX_SLUG_LENGTH)).replace(/-+$/g, '')
}

export function articlePath(article: Pick<Article, 'year' | 'slug'>): string {
  return `/articles/${article.year}/${article.slug}.html`
}

type Candidate = {
  sourceUrl: string; title: string; source: string; summary: string; topic: Topic
  categories: string[]; publishedAt: Date
}

function toDate(value: string, fallback: Date): Date {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

export function candidatesFromSnapshot(snapshot: Snapshot): Candidate[] {
  const now = new Date()
  return snapshot.feeds.flatMap((feed) => feed.items.map((item) => {
    const topic = classifyTopic(`${item.title} ${item.description.slice(0, 320)} ${item.categories.join(' ')}`, FEED_TOPICS[feed.url] ?? 'entertainment')
    const candidate = { title: item.title, summary: item.description, source: feed.source, topic, categories: item.categories.slice(0, 8) }
    return {
      sourceUrl: item.link, ...candidate,
      categories: [...candidate.categories, ...archiveCategories(candidate)],
      publishedAt: toDate(item.pubDate, now),
    }
  }))
}

export function curatedCandidates(): Candidate[] {
  return CURATED_STORIES.map((story) => {
    const topic = story.category as Topic
    const candidate = { title: story.title, summary: story.summary, source: story.source, topic, categories: story.tags }
    return {
      sourceUrl: story.link, ...candidate,
      categories: [...candidate.categories, ...archiveCategories(candidate)],
      publishedAt: toDate(`${story.date}T12:00:00Z`, new Date()),
    }
  })
}

const CHUNK = 400
async function existingPaths(urls: string[]): Promise<Map<string, string>> {
  const paths = new Map<string, string>()
  for (let i = 0; i < urls.length; i += CHUNK) {
    const rows = await db.select({ sourceUrl: articles.sourceUrl, year: articles.year, slug: articles.slug }).from(articles).where(inArray(articles.sourceUrl, urls.slice(i, i + CHUNK)))
    for (const row of rows) paths.set(row.sourceUrl, articlePath(row))
  }
  return paths
}

export async function ensureArticles(candidates: Candidate[]): Promise<Map<string, string>> {
  const unique = new Map<string, Candidate>()
  for (const c of candidates) if (c.sourceUrl && !unique.has(c.sourceUrl)) unique.set(c.sourceUrl, c)
  const urls = [...unique.keys()]
  const paths = await existingPaths(urls)
  const missing = urls.filter((url) => !paths.has(url)).map((url) => unique.get(url)!)
  if (!missing.length) return paths
  const row = (c: Candidate, slug: string) => ({
    sourceUrl: c.sourceUrl, year: String(c.publishedAt.getUTCFullYear()), slug,
    title: c.title, source: c.source, summary: c.summary, topic: c.topic,
    categories: [...new Set(c.categories)], publishedAt: c.publishedAt,
  })
  const taken = new Set<string>()
  const firstPass = missing.filter((c) => {
    const key = `${c.publishedAt.getUTCFullYear()}/${slugify(c.title)}`
    if (taken.has(key)) return false
    taken.add(key)
    return true
  })
  for (let i = 0; i < firstPass.length; i += CHUNK) {
    await db.insert(articles).values(firstPass.slice(i, i + CHUNK).map((c) => row(c, slugify(c.title)))).onConflictDoNothing()
  }
  const afterFirst = await existingPaths(missing.map((c) => c.sourceUrl))
  for (const [url, path] of afterFirst) paths.set(url, path)
  for (const c of missing) {
    if (paths.has(c.sourceUrl)) continue
    const base = slugify(c.title)
    for (let n = 2; n < 50; n++) {
      const inserted = await db.insert(articles).values(row(c, `${base.slice(0, MAX_SLUG_LENGTH - 4)}-${n}`)).onConflictDoNothing().returning({ year: articles.year, slug: articles.slug })
      if (inserted[0]) { paths.set(c.sourceUrl, articlePath(inserted[0])); break }
      const raced = await existingPaths([c.sourceUrl])
      if (raced.has(c.sourceUrl)) { paths.set(c.sourceUrl, raced.get(c.sourceUrl)!); break }
    }
  }
  return paths
}

export async function archiveSnapshot(snapshot: Snapshot): Promise<Map<string, string>> {
  return ensureArticles([...candidatesFromSnapshot(snapshot), ...curatedCandidates()])
}

export async function findArticle(year: string, slug: string): Promise<Article | undefined> {
  const [row] = await db.select().from(articles).where(and(eq(articles.year, year), eq(articles.slug, slug))).limit(1)
  return row
}

export async function findArticleBySourceUrl(sourceUrl: string): Promise<Article | undefined> {
  const [row] = await db.select().from(articles).where(eq(articles.sourceUrl, sourceUrl)).limit(1)
  return row
}

export const ARCHIVE_PER_PAGE = 25
export const CATEGORY_PER_PAGE = 20

// Every article, newest first. Used by the build-time search indexer.
export async function allArticles(): Promise<Article[]> {
  return db.select().from(articles).orderBy(desc(articles.publishedAt), desc(articles.id))
}

export type CategoryPage = { articles: Article[]; total: number; page: number; totalPages: number; perPage: number }

// Categorizes the whole archive in one pass (newest first). Categories are recomputed
// from article text so older rows and rule improvements apply retroactively.
async function categorizedArchive(): Promise<{ article: Article; categories: ArchiveCategory[] }[]> {
  const rows = await db.select().from(articles).orderBy(desc(articles.publishedAt), desc(articles.id))
  return rows.map((article) => ({ article, categories: archiveCategories(article) }))
}

// Returns null when the requested page is past the end of the archive.
export async function articlesForCategory(category: ArchiveCategory, page: number, perPage: number): Promise<CategoryPage | null> {
  const matches = (await categorizedArchive()).filter((row) => row.categories.includes(category)).map((row) => row.article)
  const totalPages = Math.max(1, Math.ceil(matches.length / perPage))
  if (page > totalPages) return null
  return { articles: matches.slice((page - 1) * perPage, page * perPage), total: matches.length, page, totalPages, perPage }
}

// The full archive, newest first. Returns null when the page is past the end.
export async function archivePage(page: number, perPage: number): Promise<CategoryPage | null> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(articles)
  const total = Number(count)
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  if (page > totalPages) return null
  const rows = await db.select().from(articles).orderBy(desc(articles.publishedAt), desc(articles.id)).limit(perPage).offset((page - 1) * perPage)
  return { articles: rows, total, page, totalPages, perPage }
}

export async function categoryCounts(): Promise<Record<ArchiveCategory, number>> {
  const counts = Object.fromEntries(ARCHIVE_CATEGORIES.map((c) => [c, 0])) as Record<ArchiveCategory, number>
  for (const row of await categorizedArchive()) for (const c of row.categories) counts[c]++
  return counts
}

export async function relatedArticles(article: Article, limit = 6): Promise<Article[]> {
  const tagMatch = article.categories.length
    ? sql`${articles.categories} ?| array[${sql.join(article.categories.map((c) => sql`${c}`), sql`, `)}]::text[]`
    : sql`false`
  const related = await db.select().from(articles).where(and(ne(articles.id, article.id), or(eq(articles.topic, article.topic), tagMatch)))
    .orderBy(desc(sql`(${tagMatch})::int`), desc(sql`abs(extract(epoch from (${articles.publishedAt} - ${article.publishedAt.toISOString()}::timestamptz))) < 2592000`), desc(articles.publishedAt)).limit(limit)
  if (related.length >= limit) return related
  const exclude = [article.id, ...related.map((r) => r.id)]
  const latest = await db.select().from(articles).where(notInArray(articles.id, exclude)).orderBy(desc(articles.publishedAt)).limit(limit - related.length)
  return [...related, ...latest]
}

export async function legacySourceUrl(year: string, slug: string): Promise<string | undefined> {
  try {
    const legacy = (await getStore('article-archive').get('articles', { type: 'json' })) as { year: string; slug: string; originalUrl: string }[] | null
    return legacy?.find((a) => a.year === year && a.slug === slug)?.originalUrl
  } catch { return undefined }
}

// Article count and newest publication date per archive category (used by the sitemaps).
export async function categoryStats(): Promise<Record<ArchiveCategory, { count: number; latest: Date | null }>> {
  const stats = Object.fromEntries(ARCHIVE_CATEGORIES.map((c) => [c, { count: 0, latest: null }])) as Record<ArchiveCategory, { count: number; latest: Date | null }>
  for (const { article, categories } of await categorizedArchive()) {
    for (const c of categories) {
      stats[c].count++
      if (!stats[c].latest || article.publishedAt > stats[c].latest!) stats[c].latest = article.publishedAt
    }
  }
  return stats
}
