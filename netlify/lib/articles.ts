import { getStore } from '@netlify/blobs'
import { and, desc, eq, inArray, ne, notInArray, or, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { articles } from '../../db/schema.js'
import type { Snapshot } from './feeds.ts'
import { CURATED_STORIES } from './curated.ts'

// Permanent article pages.
//
// Every story shown on the homepage (live RSS items and curated stories) gets
// a row in the `articles` table the first time it is seen. Its URL —
// /articles/YYYY/slug.html — is assigned once, from the headline and
// publication year at that moment, and is never recomputed. Later edits to the
// headline or date by the publisher, or the story rolling out of its feed, do
// not change or break the URL.

export type Article = typeof articles.$inferSelect

export type Topic = 'first-amendment' | 'media-law' | 'entertainment' | 'defamation-privacy'

export const TOPIC_LABELS: Record<Topic, string> = {
  'first-amendment': 'First Amendment',
  'media-law': 'Media Law',
  entertainment: 'Entertainment Law',
  'defamation-privacy': 'Defamation & Privacy',
}

// Default topic per feed, refined by keywords below (mirrors the homepage).
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
  if (/(defamation|libel|journalist|reporter|press freedom|newsroom|subpoena|foia|public records|privacy|section 230)/.test(t)) return 'media-law'
  if (/(first amendment|free speech|free expression|censorship|protest|religious liberty|book ban)/.test(t)) return 'first-amendment'
  return fallback
}

const MAX_SLUG_LENGTH = 80

// "Court Rules ISPs Aren't Liable — For Now" -> "court-rules-isps-arent-liable-for-now"
export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’‘`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug.length <= MAX_SLUG_LENGTH) return slug || 'article'
  // Cut on a word boundary so slugs don't end mid-word.
  const cut = slug.slice(0, MAX_SLUG_LENGTH + 1)
  const boundary = cut.lastIndexOf('-')
  return (boundary > 20 ? cut.slice(0, boundary) : slug.slice(0, MAX_SLUG_LENGTH)).replace(/-+$/g, '')
}

export function articlePath(article: Pick<Article, 'year' | 'slug'>): string {
  return `/articles/${article.year}/${article.slug}.html`
}

type Candidate = {
  sourceUrl: string
  title: string
  source: string
  summary: string
  topic: Topic
  categories: string[]
  publishedAt: Date
}

function toDate(value: string, fallback: Date): Date {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

export function candidatesFromSnapshot(snapshot: Snapshot): Candidate[] {
  const now = new Date()
  return snapshot.feeds.flatMap((feed) =>
    feed.items.map((item) => ({
      sourceUrl: item.link,
      title: item.title,
      source: feed.source,
      summary: item.description,
      topic: classifyTopic(
        `${item.title} ${item.description.slice(0, 320)} ${item.categories.join(' ')}`,
        FEED_TOPICS[feed.url] ?? 'entertainment'
      ),
      categories: item.categories.slice(0, 8),
      publishedAt: toDate(item.pubDate, now),
    }))
  )
}

export function curatedCandidates(): Candidate[] {
  return CURATED_STORIES.map((story) => ({
    sourceUrl: story.link,
    title: story.title,
    source: story.source,
    summary: story.summary,
    topic: story.category as Topic,
    categories: story.tags,
    publishedAt: toDate(`${story.date}T12:00:00Z`, new Date()),
  }))
}

const CHUNK = 400

async function existingPaths(urls: string[]): Promise<Map<string, string>> {
  const paths = new Map<string, string>()
  for (let i = 0; i < urls.length; i += CHUNK) {
    const rows = await db
      .select({ sourceUrl: articles.sourceUrl, year: articles.year, slug: articles.slug })
      .from(articles)
      .where(inArray(articles.sourceUrl, urls.slice(i, i + CHUNK)))
    for (const row of rows) paths.set(row.sourceUrl, articlePath(row))
  }
  return paths
}

// Makes sure every candidate has a permanent page and returns a map of
// original URL -> permanent path. Existing rows are never modified.
export async function ensureArticles(candidates: Candidate[]): Promise<Map<string, string>> {
  const unique = new Map<string, Candidate>()
  for (const c of candidates) if (c.sourceUrl && !unique.has(c.sourceUrl)) unique.set(c.sourceUrl, c)
  const urls = [...unique.keys()]
  const paths = await existingPaths(urls)
  const missing = urls.filter((url) => !paths.has(url)).map((url) => unique.get(url)!)
  if (!missing.length) return paths

  const row = (c: Candidate, slug: string) => ({
    sourceUrl: c.sourceUrl,
    year: String(c.publishedAt.getUTCFullYear()),
    slug,
    title: c.title,
    source: c.source,
    summary: c.summary,
    topic: c.topic,
    categories: c.categories,
    publishedAt: c.publishedAt,
  })

  // Fast path: insert everything with its plain slug in one statement. Rows
  // whose slug is already taken that year (or that another request inserted
  // first) are skipped by ON CONFLICT DO NOTHING and handled one by one below.
  const taken = new Set<string>()
  const firstPass = missing.filter((c) => {
    const key = `${c.publishedAt.getUTCFullYear()}/${slugify(c.title)}`
    if (taken.has(key)) return false
    taken.add(key)
    return true
  })
  for (let i = 0; i < firstPass.length; i += CHUNK) {
    await db
      .insert(articles)
      .values(firstPass.slice(i, i + CHUNK).map((c) => row(c, slugify(c.title))))
      .onConflictDoNothing()
  }

  const afterFirst = await existingPaths(missing.map((c) => c.sourceUrl))
  for (const [url, path] of afterFirst) paths.set(url, path)

  // Slug collisions: two different stories with the same headline in the same
  // year. Later ones get -2, -3, … appended.
  for (const c of missing) {
    if (paths.has(c.sourceUrl)) continue
    const base = slugify(c.title)
    for (let n = 2; n < 50; n++) {
      const inserted = await db
        .insert(articles)
        .values(row(c, `${base.slice(0, MAX_SLUG_LENGTH - 4)}-${n}`))
        .onConflictDoNothing()
        .returning({ year: articles.year, slug: articles.slug })
      if (inserted[0]) {
        paths.set(c.sourceUrl, articlePath(inserted[0]))
        break
      }
      const raced = await existingPaths([c.sourceUrl])
      if (raced.has(c.sourceUrl)) {
        paths.set(c.sourceUrl, raced.get(c.sourceUrl)!)
        break
      }
    }
  }
  return paths
}

export async function archiveSnapshot(snapshot: Snapshot): Promise<Map<string, string>> {
  return ensureArticles([...candidatesFromSnapshot(snapshot), ...curatedCandidates()])
}

export async function findArticle(year: string, slug: string): Promise<Article | undefined> {
  const [row] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.year, year), eq(articles.slug, slug)))
    .limit(1)
  return row
}

export async function findArticleBySourceUrl(sourceUrl: string): Promise<Article | undefined> {
  const [row] = await db.select().from(articles).where(eq(articles.sourceUrl, sourceUrl)).limit(1)
  return row
}

// Related stories: same topic or overlapping tags, newest first, topped up
// with the latest stories overall if there aren't enough.
export async function relatedArticles(article: Article, limit = 6): Promise<Article[]> {
  const tagMatch = article.categories.length
    ? sql`${articles.categories} ?| array[${sql.join(article.categories.map((c) => sql`${c}`), sql`, `)}]::text[]`
    : sql`false`
  const related = await db
    .select()
    .from(articles)
    .where(and(ne(articles.id, article.id), or(eq(articles.topic, article.topic), tagMatch)))
    .orderBy(
      desc(sql`(${tagMatch})::int`),
      desc(sql`abs(extract(epoch from (${articles.publishedAt} - ${article.publishedAt.toISOString()}::timestamptz))) < 2592000`),
      desc(articles.publishedAt)
    )
    .limit(limit)
  if (related.length >= limit) return related
  const exclude = [article.id, ...related.map((r) => r.id)]
  const latest = await db
    .select()
    .from(articles)
    .where(notInArray(articles.id, exclude))
    .orderBy(desc(articles.publishedAt))
    .limit(limit - related.length)
  return [...related, ...latest]
}

// The first version of the permalink system (briefly live before this one)
// kept its index in Netlify Blobs with a hash suffix in each slug. Those URLs
// redirect permanently to the article's current address.
export async function legacySourceUrl(year: string, slug: string): Promise<string | undefined> {
  try {
    const legacy = (await getStore('article-archive').get('articles', { type: 'json' })) as
      | { year: string; slug: string; originalUrl: string }[]
      | null
    return legacy?.find((a) => a.year === year && a.slug === slug)?.originalUrl
  } catch {
    return undefined
  }
}
