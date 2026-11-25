import { and, asc, desc, gte, lte, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { articles } from '../../db/schema.js'
import { articlePath, categoryStats, ARCHIVE_CATEGORIES, ARCHIVE_PER_PAGE, CATEGORY_PER_PAGE } from './articles.ts'
import { archivePath, categoryPath } from './article-page.ts'

export const SITE = 'https://medialawnews.com'
// Google's limit is 50,000 URLs per sitemap; article sitemaps are split well below that.
export const ARTICLES_PER_SITEMAP = 5000

// Hand-written HTML pages published from the repository root.
const STATIC_PAGES = ['/', '/google-news.html', '/daily-digest.html', '/harvard-law-review-first-amendment.html']

type Entry = { loc: string; lastmod?: Date | null }

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const lastmod = (d?: Date | null) => (d ? `<lastmod>${d.toISOString()}</lastmod>` : '')
const maxDate = (dates: (Date | null | undefined)[]) => dates.reduce<Date | null>((max, d) => (d && (!max || d > max) ? d : max), null)

function urlset(entries: Entry[]): string {
  const urls = entries.map((e) => `<url><loc>${escapeXml(SITE + e.loc)}</loc>${lastmod(e.lastmod)}</url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

function sitemapIndex(entries: Entry[]): string {
  const maps = entries.map((e) => `<sitemap><loc>${escapeXml(SITE + e.loc)}</loc>${lastmod(e.lastmod)}</sitemap>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${maps}\n</sitemapindex>\n`
}

export const articleSitemapPath = (n: number) => `/article-sitemap-${String(n).padStart(3, '0')}.xml`

async function articleTotals(): Promise<{ total: number; latest: Date | null }> {
  const [row] = await db.select({ total: sql<number>`count(*)::int`, latest: sql<string | null>`max(${articles.publishedAt})` }).from(articles)
  return { total: Number(row.total), latest: row.latest ? new Date(row.latest) : null }
}

export const articleSitemapCount = (total: number) => Math.max(1, Math.ceil(total / ARTICLES_PER_SITEMAP))

// Root index listing every child sitemap. Article sitemaps are numbered 001, 002, …
export async function renderSitemapIndex(): Promise<string> {
  const { total, latest } = await articleTotals()
  const children: Entry[] = [{ loc: '/page-sitemap.xml', lastmod: latest }]
  // Articles are ordered by id, so new ones always land in the last file; earlier files keep their contents.
  const count = articleSitemapCount(total)
  const fileLatest = await db.select({ n: sql<number>`(row_number() over (order by ${articles.id}) - 1) / ${ARTICLES_PER_SITEMAP}`, d: articles.publishedAt }).from(articles)
  const latestPerFile = new Map<number, Date>()
  for (const { n, d } of fileLatest) {
    const k = Number(n)
    if (!latestPerFile.has(k) || d > latestPerFile.get(k)!) latestPerFile.set(k, d)
  }
  for (let i = 1; i <= count; i++) children.push({ loc: articleSitemapPath(i), lastmod: latestPerFile.get(i - 1) ?? null })
  children.push({ loc: '/category-sitemap.xml', lastmod: latest }, { loc: '/archive-sitemap.xml', lastmod: latest })
  children.push({ loc: '/news-sitemap.xml', lastmod: latest })
  return sitemapIndex(children)
}

// Homepage and the standalone static pages.
export async function renderPageSitemap(): Promise<string> {
  const { latest } = await articleTotals()
  return urlset(STATIC_PAGES.map((loc) => ({ loc, lastmod: loc === '/' ? latest : null })))
}

// Returns null when the numbered file is past the end.
export async function renderArticleSitemap(n: number): Promise<string | null> {
  const { total } = await articleTotals()
  if (n < 1 || n > articleSitemapCount(total)) return null
  const rows = await db.select({ year: articles.year, slug: articles.slug, publishedAt: articles.publishedAt }).from(articles)
    .orderBy(asc(articles.id)).limit(ARTICLES_PER_SITEMAP).offset((n - 1) * ARTICLES_PER_SITEMAP)
  return urlset(rows.map((a) => ({ loc: articlePath(a), lastmod: a.publishedAt })))
}

// The category index, every category page and each of its paginated pages.
export async function renderCategorySitemap(): Promise<string> {
  const stats = await categoryStats()
  const entries: Entry[] = [{ loc: '/category/', lastmod: maxDate(Object.values(stats).map((s) => s.latest)) }]
  for (const category of ARCHIVE_CATEGORIES) {
    const pages = Math.max(1, Math.ceil(stats[category].count / CATEGORY_PER_PAGE))
    for (let page = 1; page <= pages; page++) entries.push({ loc: categoryPath(category, page), lastmod: stats[category].latest })
  }
  return urlset(entries)
}

// The archive's first page and every paginated page after it.
export async function renderArchiveSitemap(): Promise<string> {
  const { total, latest } = await articleTotals()
  const pages = Math.max(1, Math.ceil(total / ARCHIVE_PER_PAGE))
  return urlset(Array.from({ length: pages }, (_, i) => ({ loc: archivePath(i + 1), lastmod: latest })))
}

// Google News sitemap: only articles published in the last 48 hours, at most 1,000 entries.
// The window is computed on every request, so older articles drop out automatically.
export const NEWS_WINDOW_MS = 48 * 60 * 60 * 1000
export const NEWS_MAX_URLS = 1000
const PUBLICATION_NAME = 'Media Law News'
const PUBLICATION_LANGUAGE = 'en'

export async function renderNewsSitemap(now = new Date()): Promise<string> {
  const since = new Date(now.getTime() - NEWS_WINDOW_MS)
  const rows = await db.select({ year: articles.year, slug: articles.slug, title: articles.title, publishedAt: articles.publishedAt })
    .from(articles)
    // Future-dated items are left out until their publication time arrives.
    .where(and(gte(articles.publishedAt, since), lte(articles.publishedAt, now)))
    .orderBy(desc(articles.publishedAt), desc(articles.id))
    .limit(NEWS_MAX_URLS)
  const urls = rows.map((a) => [
    '<url>',
    `<loc>${escapeXml(SITE + articlePath(a))}</loc>`,
    '<news:news>',
    `<news:publication><news:name>${escapeXml(PUBLICATION_NAME)}</news:name><news:language>${PUBLICATION_LANGUAGE}</news:language></news:publication>`,
    `<news:publication_date>${a.publishedAt.toISOString()}</news:publication_date>`,
    `<news:title>${escapeXml(a.title)}</news:title>`,
    '</news:news>',
    '</url>',
  ].join('')).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${urls}${urls ? '\n' : ''}</urlset>\n`
}
