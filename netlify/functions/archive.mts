import type { Config } from '@netlify/functions'
import { archivePage } from '../lib/articles.ts'
import { archivePath, renderArchivePage, renderNotFoundPage } from '../lib/article-page.ts'

const PER_PAGE = 25
const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=60',
  'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=300, stale-while-revalidate=600',
}

const notFound = () => new Response(renderNotFoundPage(), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
const redirect = (location: string) => new Response(null, { status: 301, headers: { Location: location } })

export default async (request: Request) => {
  const url = new URL(request.url)
  if (url.pathname === '/archive.html') return redirect('/archive/')

  const match = url.pathname.match(/^\/archive(?:\/page\/([^/]+))?\/?$/)
  if (!match) return notFound()
  const queryPage = url.searchParams.get('page')
  const page = match[1] !== undefined ? Number(match[1]) : queryPage !== null ? Number(queryPage) : 1
  if (!Number.isInteger(page) || page < 1) return notFound()

  // Page 1 lives at /archive/; ?page=N links and missing trailing slashes redirect to the canonical path.
  const canonical = archivePath(page)
  if (url.pathname !== canonical || queryPage !== null) return redirect(canonical)

  const result = await archivePage(page, PER_PAGE)
  if (!result) {
    // Past the end: send readers to the last page that exists.
    const last = await archivePage(1, PER_PAGE)
    return redirect(archivePath(last?.totalPages ?? 1))
  }
  return new Response(renderArchivePage(result), { headers: HTML_HEADERS })
}

export const config: Config = {
  path: ['/archive', '/archive/', '/archive.html', '/archive/page/:page', '/archive/page/:page/'],
  method: 'GET',
}
