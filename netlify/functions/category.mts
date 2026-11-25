import type { Config, Context } from '@netlify/functions'
import { articlesForCategory, CATEGORY_PER_PAGE, categoryCounts, ARCHIVE_CATEGORIES, type ArchiveCategory } from '../lib/articles.ts'
import { categoryPath, renderCategoryIndex, renderCategoryPage, renderNotFoundPage } from '../lib/article-page.ts'

const PER_PAGE = CATEGORY_PER_PAGE
const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=60',
  'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=300, stale-while-revalidate=600',
}

const notFound = () => new Response(renderNotFoundPage(), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
const redirect = (location: string) => new Response(null, { status: 301, headers: { Location: location } })

export default async (request: Request, context: Context) => {
  const url = new URL(request.url)
  const { category, page: pageParam } = context.params

  if (!category) {
    if (!url.pathname.endsWith('/')) return redirect('/category/')
    return new Response(renderCategoryIndex(await categoryCounts()), { headers: HTML_HEADERS })
  }

  const slug = category.toLowerCase() as ArchiveCategory
  if (!ARCHIVE_CATEGORIES.includes(slug)) return notFound()

  // Legacy ?page=N links and missing trailing slashes redirect to the canonical path.
  const queryPage = url.searchParams.get('page')
  const page = pageParam !== undefined ? Number(pageParam) : queryPage !== null ? Number(queryPage) : 1
  if (!Number.isInteger(page) || page < 1) return notFound()
  const canonical = categoryPath(slug, page)
  if (url.pathname !== canonical || queryPage !== null) return redirect(canonical)

  const result = await articlesForCategory(slug, page, PER_PAGE)
  if (!result) return page > 1 ? redirect(categoryPath(slug)) : notFound()
  return new Response(renderCategoryPage(slug, result), { headers: HTML_HEADERS })
}

export const config: Config = {
  path: ['/category', '/category/', '/category/:category', '/category/:category/', '/category/:category/page/:page', '/category/:category/page/:page/'],
  method: 'GET',
}
