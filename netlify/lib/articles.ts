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
}

export function classifyTopic(text: string, fallback: Topic): Topic {
  const t = text.toLowerCase()
  if (/(defamation|libel|slander|privacy|reputation|anti-slapp|false light|intrusion|public disclosure)/.test(t)) return 'defamation-privacy'
  if (/(copyright|trademark|music|film|studio|streaming|hollywood|entertainment|royalt|licens|talent|celebrit)/.test(t)) return 'entertainment'
  if (/(journalist|reporter|press freedom|newsroom|subpoena|foia|public records|section 230)/.test(t)) return 'media-law'
  if (/(first amendment|free speech|free expression|censorship|protest|religious liberty|book ban)/.test(t)) return 'first-amendment'
  return fallback
}

const ARCHIVE_RULES: [ArchiveCategory, RegExp][] = [
  ['scotus', /(supreme court of the united states|u\.s\. supreme court|scotus|supreme court)/i],
  ['first-amendment', /(first amendment|free speech|free expression|freedom of (speech|the press)|censorship|prior restraint|book ban)/i],
  ['entertainment-law', /(entertainment|copyright|trademark|music industry|film|hollywood|streaming|right of publicity|royalt|licens)/i],
  ['privacy', /(privacy|data protection|surveillance|personal data|biometric|facial recognition)/i],
  ['defamation', /(defamation|libel|slander|false light|anti-slapp|reputation)/i],
  ['journalism', /(journalis|reporter|newsroom|news media|press freedom|newsgathering|shield law|news organization)/i],
  ['technology-law', /(technology|tech company|artificial intelligence|\bai\b|social media|platform|section 230|internet|algorithm|data breach)/i],
  ['media-law', /(media law|media company|news organization|journalis|press|broadcast|publisher|newspaper|first amendment|defamation|privacy)/i],
]

export function archiveCategories(article: Pick<Article, 'title' | 'summary' | 'source' | 'topic' | 'categories'>): ArchiveCategory[] {
  const text = `${article.title} ${article.summary} ${article.source} ${(article.categories || []).join(' ')} ${article.topic}`
  const found = new Set<ArchiveCategory>()
  const topicCategory: Partial<Record<Topic, ArchiveCategory>> = {
    'first-amendment': 'first-amendment',
    'media-law': 'media-law',
    entertainment: 'entertainment-law',
    'defamation-privacy': 'privacy',
  }
  const defaultCategory = topicCategory[article.topic as Topic] || 'media-law'
  for (const [category, pattern] of ARCHIVE_RULES) if (pattern.test(text)) found.add(category)
  if (defaultCategory === 'privacy' && /(defamation|libel|slander|anti-slapp)/i.test(text)) found.add('defamation')
  found.add(defaultCategory)
  return ARCHIVE_CATEGORIES.filter((category) => found.has(category))
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

// Fetch matching archive records in chronological order. Text predicates also
// include articles stored before archive-category slugs were added to metadata.
export async function articlesForCategory(category: ArchiveCategory): Promise<Article[]> {
  const stored = sql`${articles.categories} ? ${category}`
  const topicMatches: Partial<Record<ArchiveCategory, Topic[]>> = {
    'media-law': ['media-law'], 'first-amendment': ['first-amendment'],
    'entertainment-law': ['entertainment'], privacy: ['defamation-privacy'], defamation: ['defamation-privacy'],
  }
  const terms: Partial<Record<ArchiveCategory, string[]>> = {
    'media-law': ['media law', 'journalist', 'press', 'broadcast', 'publisher', 'newspaper'],
    'first-amendment': ['first amendment', 'free speech', 'censorship', 'prior restraint', 'book ban'],
    'entertainment-law': ['entertainment', 'copyright', 'music', 'film', 'hollywood', 'streaming', 'trademark'],
    privacy: ['privacy', 'surveillance', 'data protection', 'biometric', 'facial recognition'],
    defamation: ['defamation', 'libel', 'slander', 'anti-slapp', 'false light'],
    journalism: ['journalist', 'reporter', 'newsroom', 'newsgathering', 'press freedom', 'shield law'],
    'technology-law': ['technology', 'artificial intelligence', 'social media', 'platform', 'section 230', 'internet', 'algorithm', 'data breach'],
    scotus: ['supreme court', 'scotus'],
  }
  const matches = [stored]
  for (const topic of topicMatches[category] || []) matches.push(eq(articles.topic, topic))
  for (const term of terms[category] || []) {
    const pattern = `%${term}%`
    matches.push(or(sql`${articles.title} ilike ${pattern}`, sql`${articles.summary} ilike ${pattern}`, sql`${articles.source} ilike ${pattern}`)!)
  }
  const rows = await db.select().from(articles).where(or(...matches)!).orderBy(desc(articles.publishedAt))
  return rows.filter((article) => archiveCategories(article).includes(category))
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
