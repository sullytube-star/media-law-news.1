import type { Config, Context } from '@netlify/functions'
import { articlePath, archiveCategories, findArticle, findArticleBySourceUrl, legacySourceUrl, relatedArticles, CATEGORY_LABELS, type ArchiveCategory } from '../lib/articles.ts'
import { renderArticlePage, renderNotFoundPage } from '../lib/article-page.ts'

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export default async (_request: Request, context: Context) => {
  const { year, slug } = context.params
  const notFound = () => new Response(renderNotFoundPage(), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  if (!/^\d{4}$/.test(year) || !/^[a-z0-9-]{1,120}$/.test(slug)) return notFound()
  const article = await findArticle(year, slug)
  if (!article) {
    const sourceUrl = await legacySourceUrl(year, slug)
    const moved = sourceUrl ? await findArticleBySourceUrl(sourceUrl) : undefined
    if (moved) return new Response(null, { status: 301, headers: { Location: articlePath(moved) } })
    return notFound()
  }

  const related = await relatedArticles(article)
  let html = renderArticlePage(article, related)
  const categoryLinks = archiveCategories(article).map((category) =>
    `<a class="text-xs font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-full px-3 py-1" href="/category/${category}/">${escape(CATEGORY_LABELS[category as ArchiveCategory])}</a>`
  ).join(' ')
  const categoriesBlock = `<nav class="mt-6 flex flex-wrap gap-2" aria-label="Article categories">${categoryLinks}</nav>`
  html = html.replace('<section class="mt-8" aria-labelledby="summary-heading">', `${categoriesBlock}\n<section class="mt-8" aria-labelledby="summary-heading">`)
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}

export const config: Config = { path: '/articles/:year/:slug.html', method: 'GET' }
