import type { Config } from '@netlify/functions'
import { renderArchiveSitemap, renderArticleSitemap, renderCategorySitemap, renderPageSitemap, renderSitemapIndex } from '../lib/sitemaps.ts'

const XML_HEADERS = {
  'Content-Type': 'application/xml; charset=utf-8',
  'Cache-Control': 'public, max-age=300',
  'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=900, stale-while-revalidate=3600',
}

const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })

export default async (request: Request) => {
  const { pathname } = new URL(request.url)
  let xml: string | null = null
  if (pathname === '/sitemap.xml') xml = await renderSitemapIndex()
  else if (pathname === '/page-sitemap.xml') xml = await renderPageSitemap()
  else if (pathname === '/category-sitemap.xml') xml = await renderCategorySitemap()
  else if (pathname === '/archive-sitemap.xml') xml = await renderArchiveSitemap()
  else {
    // Article sitemaps use three-digit numbering: /article-sitemap-001.xml, -002.xml, …
    const match = pathname.match(/^\/article-sitemap-(\d{3,})\.xml$/)
    if (match && String(Number(match[1])).padStart(3, '0') === match[1]) xml = await renderArticleSitemap(Number(match[1]))
  }
  return xml === null ? notFound() : new Response(xml, { headers: XML_HEADERS })
}

export const config: Config = {
  path: ['/sitemap.xml', '/page-sitemap.xml', '/category-sitemap.xml', '/archive-sitemap.xml', '/article-sitemap-*'],
  method: 'GET',
}
