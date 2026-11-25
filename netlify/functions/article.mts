import type { Config } from '@netlify/functions'
import { findArticle, articlePage, readArchivedArticles, archiveSnapshot } from '../lib/articles.ts'
import { readSnapshot } from '../lib/feeds.ts'

export default async (request: Request) => {
  const url = new URL(request.url)
  const match = url.pathname.match(/^\/articles\/(\d{4})\/([^/]+)\.html$/)
  if (!match) return new Response('Not found', { status: 404 })

  let records = await readArchivedArticles().catch(() => [])
  if (!records.length) {
    const snapshot = await readSnapshot().catch(() => null)
    if (snapshot) records = await archiveSnapshot(snapshot).catch(() => [])
  }
  const article = findArticle(records, match[1], match[2])
  if (!article) return new Response('Article not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })

  const related = records.filter((candidate) => candidate.categories.some((category) => article.categories.includes(category)))
  return articlePage(article, related)
}

export const config: Config = {
  path: '/articles/:year/:slug.html',
  method: 'GET',
}
