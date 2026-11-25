import type { Config } from '@netlify/functions'
import { articlesForCategory, ARCHIVE_CATEGORIES, CATEGORY_LABELS, type ArchiveCategory } from '../lib/articles.ts'
import { renderNotFoundPage } from '../lib/article-page.ts'

const PER_PAGE = 20
const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const dateLabel = (date: Date) => date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })

function pageHtml(category: ArchiveCategory, articles: Awaited<ReturnType<typeof articlesForCategory>>, page: number, totalPages: number): string {
  const label = CATEGORY_LABELS[category]
  const currentPath = `/category/${category}/`
  const cards = articles.map((article) => `<article class="bg-white border border-slate-200 rounded-2xl p-6">
    <p class="text-xs font-semibold text-blue-700">${escape(article.source)} · <time datetime="${article.publishedAt.toISOString()}">${dateLabel(article.publishedAt)}</time></p>
    <h2 class="mt-2 text-xl font-bold"><a class="hover:text-blue-800" href="/articles/${article.year}/${article.slug}.html">${escape(article.title)}</a></h2>
    <p class="mt-3 text-slate-600 leading-7">${escape(article.summary || 'Read the original report for full details.')}</p>
  </article>`).join('\n')
  const pageLink = (n: number, text: string, current = false) => `<a ${current ? 'aria-current="page"' : ''} class="px-4 py-2 rounded-lg border ${current ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-blue-900 hover:bg-blue-50'}" href="${currentPath}${n > 1 ? `?page=${n}` : ''}">${text}</a>`
  const pagination = totalPages > 1 ? `<nav class="mt-10 flex flex-wrap items-center justify-center gap-2" aria-label="Archive pagination">
    ${page > 1 ? pageLink(page - 1, 'Previous') : ''}
    ${Array.from({ length: totalPages }, (_, i) => i + 1).filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 2).map((n) => pageLink(n, String(n), n === page)).join(' ')}
    ${page < totalPages ? pageLink(page + 1, 'Next') : ''}
  </nav>` : ''
  const categoryNav = ARCHIVE_CATEGORIES.map((item) => `<a class="text-sm ${item === category ? 'font-bold text-blue-900' : 'text-blue-700 hover:underline'}" href="/category/${item}/">${CATEGORY_LABELS[item]}</a>`).join('<span class="text-slate-300">·</span>')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${label} Articles | Media Law News</title><meta name="description" content="Browse ${label} articles and developments from Media Law News.">
  <link rel="canonical" href="https://medialawnews.com${currentPath}"><script src="https://cdn.tailwindcss.com"></script></head>
  <body class="bg-slate-50 text-slate-900"><header class="bg-white border-b"><div class="max-w-4xl mx-auto px-6 py-5"><a class="font-bold text-blue-900" href="/">Media Law News</a></div></header>
  <main class="max-w-4xl mx-auto px-6 py-10"><nav class="text-sm text-slate-500" aria-label="Breadcrumb"><a class="hover:text-blue-800" href="/">Home</a><span class="mx-2">/</span><a class="hover:text-blue-800" href="/category/${category}/">Categories</a><span class="mx-2">/</span><span aria-current="page">${label}</span></nav>
  <h1 class="mt-6 text-4xl font-bold tracking-tight">${label}</h1><p class="mt-2 text-slate-600">${articles.length} ${articles.length === 1 ? 'article' : 'articles'} · Page ${page} of ${totalPages}</p>
  <nav class="mt-5 flex flex-wrap gap-x-3 gap-y-2" aria-label="Article categories">${categoryNav}</nav>
  <section class="mt-8 space-y-4" aria-label="${label} articles">${cards || '<p class="bg-white border rounded-2xl p-6 text-slate-600">No articles are available in this category yet.</p>'}</section>${pagination}
  </main><footer class="mt-12 border-t bg-white"><div class="max-w-4xl mx-auto px-6 py-8 text-xs text-slate-500">Media Law News aggregates coverage from independent publishers.</div></footer></body></html>`
}

export default async (request: Request, context: Context) => {
  const category = context.params.category as ArchiveCategory
  if (!ARCHIVE_CATEGORIES.includes(category)) return new Response(renderNotFoundPage(), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  const url = new URL(request.url)
  const pageParam = Number.parseInt(url.searchParams.get('page') || '1', 10)
  const requestedPage = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1
  const allArticles = await articlesForCategory(category)
  const totalPages = Math.max(1, Math.ceil(allArticles.length / PER_PAGE))
  const page = Math.min(requestedPage, totalPages)
  const pageItems = allArticles.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  return new Response(pageHtml(category, pageItems, page, totalPages), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
      'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=300, stale-while-revalidate=600',
    },
  })
}

export const config: Config = { path: '/category/:category/', method: 'GET' }
