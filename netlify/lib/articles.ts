import { getStore } from '@netlify/blobs'
import type { FeedItem, Snapshot } from './feeds.ts'

export type ArticleRecord = {
  year: string
  slug: string
  path: string
  title: string
  date: string
  source: string
  summary: string
  originalUrl: string
  categories: string[]
}

const STORE_NAME = 'article-archive'
const INDEX_KEY = 'articles'

function slugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90)
    .replace(/-+$/g, '') || 'article'
}

function stableHash(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function articlePath(title: string, date: string, originalUrl: string): string {
  const parsed = new Date(date)
  const year = Number.isNaN(parsed.getTime()) ? new Date().getUTCFullYear() : parsed.getUTCFullYear()
  return `/articles/${year}/${slugify(title)}-${stableHash(originalUrl)}.html`
}

function recordsFromSnapshot(snapshot: Snapshot): ArticleRecord[] {
  return snapshot.feeds.flatMap((feed) => feed.items.map((item: FeedItem) => {
    const path = articlePath(item.title, item.pubDate || snapshot.updatedAt, item.link)
    const match = path.match(/^\/articles\/(\d{4})\/(.+)\.html$/)!
    return {
      year: match[1], slug: match[2], path,
      title: item.title,
      date: item.pubDate || snapshot.updatedAt,
      source: feed.source,
      summary: item.description || 'Read the original report for details.',
      originalUrl: item.link,
      categories: item.categories || [],
    }
  }))
}

function getStoreInstance() {
  return getStore(STORE_NAME)
}

export async function archiveSnapshot(snapshot: Snapshot): Promise<ArticleRecord[]> {
  const store = getStoreInstance()
  const previous = (await store.get(INDEX_KEY, { type: 'json' }).catch(() => null)) as ArticleRecord[] | null
  const bySourceUrl = new Map((previous || []).map((article) => [article.originalUrl, article]))

  for (const article of recordsFromSnapshot(snapshot)) {
    const existing = bySourceUrl.get(article.originalUrl)
    // Keep the first published URL even if a publisher later changes a headline/date.
    bySourceUrl.set(article.originalUrl, existing ? { ...article, year: existing.year, slug: existing.slug, path: existing.path } : article)
  }

  const records = [...bySourceUrl.values()]
  await store.setJSON(INDEX_KEY, records)
  return records
}

export async function readArchivedArticles(): Promise<ArticleRecord[]> {
  return ((await getStoreInstance().get(INDEX_KEY, { type: 'json' })) as ArticleRecord[] | null) || []
}

export function findArticle(records: ArticleRecord[], year: string, slug: string): ArticleRecord | undefined {
  return records.find((article) => article.year === year && article.slug === slug)
}

export function articlePage(article: ArticleRecord, related: ArticleRecord[]): Response {
  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!)
  const date = new Date(article.date)
  const displayDate = Number.isNaN(date.getTime()) ? article.date : date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
  const relatedHtml = related.filter((item) => item.path !== article.path).slice(0, 5).map((item) =>
    `<li><a class="related-link" href="${escape(item.path)}">${escape(item.title)}</a><span>${escape(item.source)} · ${escape(item.date.slice(0, 10))}</span></li>`
  ).join('') || '<li>No related articles yet.</li>'
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(article.title)} | Media Law News</title><meta name="description" content="${escape(article.summary.slice(0, 155))}">
<link rel="canonical" href="https://medialawnews.com${escape(article.path)}"><script src="https://cdn.tailwindcss.com"></script>
</head><body class="bg-slate-50 text-slate-900"><header class="bg-white border-b"><div class="max-w-3xl mx-auto px-6 py-5"><a class="font-bold text-blue-900" href="/">Media Law News</a></div></header>
<main class="max-w-3xl mx-auto px-6 py-12"><article><p class="text-sm font-semibold text-blue-700">${escape(article.source)}</p>
<h1 class="mt-3 text-4xl font-bold tracking-tight">${escape(article.title)}</h1><time class="block mt-4 text-slate-500" datetime="${escape(article.date)}">${escape(displayDate)}</time>
<section class="mt-8 text-lg leading-8"><h2 class="text-xl font-semibold">Summary</h2><p class="mt-2">${escape(article.summary)}</p></section>
<a class="inline-block mt-8 text-blue-800 font-semibold underline" href="${escape(article.originalUrl)}" target="_blank" rel="noopener noreferrer">Read the original article at ${escape(article.source)}</a>
</article><section class="mt-14 border-t pt-8"><h2 class="text-2xl font-bold">Related articles</h2><ul class="mt-4 space-y-4">${relatedHtml}</ul></section>
<p class="mt-12"><a class="text-blue-800 underline" href="/">← Back to Media Law News</a></p></main></body></html>`
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } })
}
