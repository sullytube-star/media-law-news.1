// Builds the Pagefind full-text search index during the Netlify build.
//
// Article, category and archive pages are rendered on demand by Netlify Functions,
// so there are no static HTML files for Pagefind to crawl. Instead this script
// renders every one of those pages with the same templates the functions use
// (reading articles straight from Netlify Database) and feeds the HTML to
// Pagefind's Node API. If the database can't be reached from the build, it falls
// back to fetching the pages from the live site.
//
// Output: ./pagefind/ in the publish directory (served at /pagefind/).

import * as pagefind from 'pagefind'
import { rm } from 'node:fs/promises'
import path from 'node:path'

type Page = { url: string; content: string }

const OUTPUT = path.resolve('pagefind')
const DB_TIMEOUT_MS = 30_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms).unref())])
}

// Renders every article, category and archive page from the database.
async function pagesFromDatabase(): Promise<Page[]> {
  if (!process.env.NETLIFY_DB_URL) throw new Error('NETLIFY_DB_URL is not set')
  const lib = await import('../netlify/lib/articles.ts')
  const tpl = await import('../netlify/lib/article-page.ts')
  const all = await withTimeout(lib.allArticles(), DB_TIMEOUT_MS, 'Article query')
  const pages: Page[] = []

  for (const article of all) pages.push({ url: lib.articlePath(article), content: tpl.renderArticlePage(article, []) })

  const paginate = (list: typeof all, perPage: number, emit: (result: import('../netlify/lib/articles.ts').CategoryPage) => void) => {
    const totalPages = Math.max(1, Math.ceil(list.length / perPage))
    for (let page = 1; page <= totalPages; page++) {
      emit({ articles: list.slice((page - 1) * perPage, page * perPage), total: list.length, page, totalPages, perPage })
    }
  }

  paginate(all, lib.ARCHIVE_PER_PAGE, (r) => pages.push({ url: tpl.archivePath(r.page), content: tpl.renderArchivePage(r) }))

  const categorized = all.map((article) => ({ article, categories: lib.archiveCategories(article) }))
  const counts = Object.fromEntries(lib.ARCHIVE_CATEGORIES.map((c) => [c, 0])) as Record<string, number>
  for (const row of categorized) for (const c of row.categories) counts[c]++
  pages.push({ url: '/category/', content: tpl.renderCategoryIndex(counts as Parameters<typeof tpl.renderCategoryIndex>[0]) })
  for (const category of lib.ARCHIVE_CATEGORIES) {
    const matches = categorized.filter((row) => row.categories.includes(category)).map((row) => row.article)
    paginate(matches, lib.CATEGORY_PER_PAGE, (r) => pages.push({ url: tpl.categoryPath(category, r.page), content: tpl.renderCategoryPage(category, r) }))
  }
  return pages
}

// Fallback: crawl the deployed site's archive, category and article pages.
async function pagesFromLiveSite(): Promise<Page[]> {
  const origin = (process.env.URL || 'https://medialawnews.com').replace(/\/$/, '')
  const allowed = /^\/(archive\/(page\/\d+\/)?|category\/([a-z-]+\/(page\/\d+\/)?)?|articles\/\d{4}\/[a-z0-9-]+\.html)$/
  const queue = ['/archive/', '/category/']
  const seen = new Set(queue)
  const pages: Page[] = []
  const MAX_PAGES = 20_000

  const fetchPage = async (pathname: string) => {
    const res = await fetch(origin + pathname, { redirect: 'manual', signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return
    const html = await res.text()
    pages.push({ url: pathname, content: html })
    for (const [, href] of html.matchAll(/href="([^"#?]+)"/g)) {
      let target: string
      try {
        const u = new URL(href.replace(/&amp;/g, '&'), origin + pathname)
        if (u.origin !== new URL(origin).origin) continue
        target = u.pathname
      } catch { continue }
      if (allowed.test(target) && !seen.has(target) && seen.size < MAX_PAGES) {
        seen.add(target)
        queue.push(target)
      }
    }
  }

  // Fetch in batches of 8 until no new links turn up.
  while (queue.length) {
    const batch = queue.splice(0, 8)
    await Promise.all(batch.map((next) => fetchPage(next).catch((error) => console.warn(`  skipped ${next}: ${(error as Error).message}`))))
  }
  return pages
}

async function main() {
  let pages: Page[] = []
  try {
    pages = await pagesFromDatabase()
    console.log(`Pagefind: rendered ${pages.length} pages from Netlify Database`)
  } catch (error) {
    console.warn(`Pagefind: database unavailable during build (${(error as Error).message}); crawling the live site instead`)
    try {
      pages = await pagesFromLiveSite()
      console.log(`Pagefind: fetched ${pages.length} pages from the live site`)
    } catch (crawlError) {
      console.warn(`Pagefind: live-site crawl failed (${(crawlError as Error).message}); writing an empty index`)
    }
  }

  const { index, errors } = await pagefind.createIndex({ forceLanguage: 'en' })
  if (!index) throw new Error(`Pagefind failed to start: ${errors.join('; ')}`)

  let indexed = 0
  for (const page of pages) {
    const result = await index.addHTMLFile({ url: page.url, content: page.content })
    if (result.errors.length) console.warn(`  ${page.url}: ${result.errors.join('; ')}`)
    else indexed++
  }

  await rm(OUTPUT, { recursive: true, force: true })
  const written = await index.writeFiles({ outputPath: OUTPUT })
  if (written.errors.length) throw new Error(`Pagefind failed to write the index: ${written.errors.join('; ')}`)
  await pagefind.close()

  const counts = { articles: 0, categories: 0, archive: 0 }
  for (const p of pages) {
    if (p.url.startsWith('/articles/')) counts.articles++
    else if (p.url.startsWith('/category/')) counts.categories++
    else if (p.url.startsWith('/archive/')) counts.archive++
  }
  console.log(`Pagefind: indexed ${indexed} pages (${counts.articles} articles, ${counts.categories} category pages, ${counts.archive} archive pages) → ${path.relative(process.cwd(), OUTPUT)}/`)
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error)
  process.exit(1)
})
