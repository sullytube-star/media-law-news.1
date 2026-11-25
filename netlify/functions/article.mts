import type { Config, Context } from '@netlify/functions'
import { articlePath, findArticle, findArticleBySourceUrl, legacySourceUrl, relatedArticles } from '../lib/articles.ts'
import { renderArticlePage, renderNotFoundPage } from '../lib/article-page.ts'

// Serves the permanent page for each article: /articles/YYYY/slug.html
export default async (_request: Request, context: Context) => {
  const { year, slug } = context.params
  const notFound = () =>
    new Response(renderNotFoundPage(), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  if (!/^\d{4}$/.test(year) || !/^[a-z0-9-]{1,120}$/.test(slug)) return notFound()

  const article = await findArticle(year, slug)
  if (!article) {
    // URLs from the first permalink version redirect to the current address.
    const sourceUrl = await legacySourceUrl(year, slug)
    const moved = sourceUrl ? await findArticleBySourceUrl(sourceUrl) : undefined
    if (moved) return new Response(null, { status: 301, headers: { Location: articlePath(moved) } })
    return notFound()
  }

  const related = await relatedArticles(article)
  return new Response(renderArticlePage(article, related), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      // Article content never changes, but related stories do; cache at the CDN for an hour.
      'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}

export const config: Config = {
  path: '/articles/:year/:slug.html',
  method: 'GET',
}
