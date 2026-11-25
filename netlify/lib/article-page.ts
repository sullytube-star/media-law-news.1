import { articlePath, archiveCategories, primaryCategory, ARCHIVE_CATEGORIES, CATEGORY_DESCRIPTIONS, CATEGORY_LABELS, TOPIC_LABELS, type ArchiveCategory, type Article, type CategoryPage, type Topic } from './articles.ts'

const SITE = 'https://medialawnews.com'

const TOPIC_COLORS: Record<Topic, string> = {
  'first-amendment': 'bg-violet-100 text-violet-700',
  'media-law': 'bg-amber-100 text-amber-700',
  entertainment: 'bg-emerald-100 text-emerald-700',
  'defamation-privacy': 'bg-rose-100 text-rose-700',
}

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function longDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

function shortDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 3).replace(/\s+\S*$/, '') + '…' : text
}

function safeHttpUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '#'
  } catch {
    return '#'
  }
}

function shell(title: string, head: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escape(title)}</title>
${head}
<script src="https://cdn.tailwindcss.com"></script>
<script src="/search.js" defer></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Playfair+Display:wght@700&display=swap');
body { font-family: 'Inter', system-ui, sans-serif; }
.heading-serif { font-family: 'Playfair Display', Georgia, serif; }
.category-tag { font-size: .75rem; padding: .125rem .625rem; border-radius: 9999px; font-weight: 600; letter-spacing: .025em; }
</style>
</head>
<body class="bg-slate-50 text-slate-900 antialiased">
<header class="bg-white border-b border-slate-200">
  <div class="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
    <a href="/" class="flex items-center gap-x-3">
      <span class="w-9 h-9 bg-blue-900 text-white rounded-2xl flex items-center justify-center"><i class="fa-solid fa-scale-balanced"></i></span>
      <span class="heading-serif text-xl text-blue-950">Media Law News</span>
    </a>
    <nav class="flex items-center gap-x-4 sm:gap-x-5 text-sm font-medium text-slate-600"><a href="/archive/" class="hover:text-blue-800">Archive</a><a href="/category/" class="hover:text-blue-800">Categories</a><a href="/#news" class="hidden sm:inline hover:text-blue-800">Latest news</a>
      <button type="button" data-site-search aria-label="Search Media Law News" class="inline-flex items-center gap-x-2 rounded-3xl border border-slate-300 bg-white px-3 py-1.5 text-slate-500 hover:border-blue-600 hover:text-blue-800"><i class="fa-solid fa-magnifying-glass text-xs"></i><span class="hidden sm:inline">Search</span><kbd class="hidden md:inline text-[10px] font-mono text-slate-400 border border-slate-200 rounded px-1">/</kbd></button></nav>
  </div>
</header>
${body}
<footer class="border-t border-slate-200 bg-white">
  <div class="max-w-4xl mx-auto px-6 py-8 text-xs text-slate-500">Media Law News aggregates coverage from independent publishers. Headlines and summaries belong to their original sources.</div>
</footer>
</body>
</html>`
}

type Crumb = { name: string; path?: string }

// Visible breadcrumb trail plus matching schema.org BreadcrumbList markup.
function breadcrumbs(crumbs: Crumb[]): { html: string; jsonLd: string } {
  const items = crumbs.map((c, i) => {
    const last = i === crumbs.length - 1
    const label = escape(c.name)
    return last || !c.path
      ? `<li class="truncate max-w-[16rem] md:max-w-md text-slate-700" ${last ? 'aria-current="page"' : ''}>${label}</li>`
      : `<li><a href="${escape(c.path)}" class="hover:text-blue-800">${label}</a></li><li aria-hidden="true" class="text-slate-300">/</li>`
  }).join('')
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, ...(c.path ? { item: `${SITE}${c.path}` } : {}) })),
  }
  return {
    html: `<nav class="text-xs text-slate-500 mb-6" aria-label="Breadcrumb" data-pagefind-ignore><ol class="flex flex-wrap items-center gap-x-2 gap-y-1">${items}</ol></nav>`,
    jsonLd: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
  }
}

export function categoryPath(category: ArchiveCategory, page = 1): string {
  return page > 1 ? `/category/${category}/page/${page}/` : `/category/${category}/`
}

function categoryChips(categories: ArchiveCategory[], current?: ArchiveCategory, filter = false): string {
  return categories.map((c) => `<a href="${categoryPath(c)}" ${filter ? 'data-pagefind-filter="category"' : ''} ${c === current ? 'aria-current="page"' : ''} class="text-xs font-semibold rounded-full px-3 py-1 transition ${c === current ? 'bg-blue-900 text-white' : 'bg-blue-50 text-blue-800 hover:bg-blue-100'}">${escape(CATEGORY_LABELS[c])}</a>`).join('')
}

export function renderArticlePage(article: Article, related: Article[]): string {
  const path = articlePath(article)
  const url = `${SITE}${path}`
  const topic = article.topic as Topic
  const original = safeHttpUrl(article.sourceUrl)
  const summary = article.summary || 'Read the original report for full details.'
  const description = summary.length > 160 ? summary.slice(0, 157).replace(/\s+\S*$/, '') + '…' : summary

  const primary = primaryCategory(article)
  const crumbs = breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Categories', path: '/category/' }, { name: CATEGORY_LABELS[primary], path: categoryPath(primary) }, { name: article.title }])
  const categoryLinks = `<nav class="mt-6 flex flex-wrap items-center gap-2" aria-label="Article categories"><span class="text-xs font-semibold tracking-widest text-slate-500 uppercase mr-1">Filed under</span>${categoryChips(archiveCategories(article), undefined, true)}</nav>`
  const archiveSlugs = new Set<string>(ARCHIVE_CATEGORIES)
  const freeTags = article.categories.filter((t) => !archiveSlugs.has(t))
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title.slice(0, 110),
    datePublished: article.publishedAt.toISOString(),
    description,
    mainEntityOfPage: url,
    url,
    isBasedOn: original,
    sourceOrganization: { '@type': 'Organization', name: article.source },
    publisher: { '@type': 'Organization', name: 'Media Law News', url: SITE },
    articleSection: CATEGORY_LABELS[primary],
    keywords: [...new Set([...archiveCategories(article).map((c) => CATEGORY_LABELS[c]), ...freeTags])].join(', ') || undefined,
  }

  const head = `<meta name="description" content="${escape(description)}">
<link rel="canonical" href="${escape(url)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Media Law News">
<meta property="og:title" content="${escape(article.title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:url" content="${escape(url)}">
<meta property="article:published_time" content="${article.publishedAt.toISOString()}">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
${crumbs.jsonLd}`

  const relatedHtml = related.length
    ? related
        .map(
          (r) => `<li>
      <a href="${escape(articlePath(r))}" class="group block bg-white border border-slate-200 hover:border-blue-200 rounded-3xl p-5 h-full transition">
        <div class="flex items-center justify-between gap-3 mb-2">
          <span class="category-tag ${TOPIC_COLORS[r.topic as Topic] ?? 'bg-slate-100 text-slate-700'}">${escape(TOPIC_LABELS[r.topic as Topic] ?? 'News')}</span>
          <time class="text-xs text-slate-500 font-mono" datetime="${r.publishedAt.toISOString()}">${shortDate(r.publishedAt)}</time>
        </div>
        <h3 class="font-semibold leading-snug group-hover:text-blue-800">${escape(r.title)}</h3>
        <p class="mt-2 text-xs text-slate-500">${escape(r.source)}</p>
      </a>
    </li>`
        )
        .join('\n')
    : '<li class="text-sm text-slate-500">No related articles yet.</li>'

  const tags = freeTags.length
    ? `<ul class="mt-6 flex flex-wrap gap-2">${freeTags
        .map((t) => `<li class="text-xs bg-slate-100 text-slate-600 rounded-full px-3 py-1">${escape(t)}</li>`)
        .join('')}</ul>`
    : ''

  const body = `<main class="max-w-4xl mx-auto px-6 py-12">
  ${crumbs.html}
  <article class="bg-white border border-slate-200 rounded-3xl p-8 md:p-12" data-pagefind-body data-pagefind-sort="date:${article.publishedAt.toISOString()}">
    <span hidden data-pagefind-filter="type:Article"></span>
    <span hidden data-pagefind-meta="date:${longDate(article.publishedAt)}"></span>
    <span hidden data-pagefind-meta="source:${escape(article.source)}"></span>
    <div class="flex flex-wrap items-center gap-3">
      <span class="category-tag ${TOPIC_COLORS[topic] ?? 'bg-slate-100 text-slate-700'}">${escape(TOPIC_LABELS[topic] ?? 'News')}</span>
      <time class="text-sm text-slate-500" datetime="${article.publishedAt.toISOString()}">${longDate(article.publishedAt)}</time>
    </div>
    <h1 class="heading-serif mt-5 text-3xl md:text-4xl leading-tight text-slate-950">${escape(article.title)}</h1>
    <p class="mt-4 text-sm text-slate-600">Source: <span class="font-semibold text-slate-800" data-pagefind-filter="source">${escape(article.source)}</span></p>
    ${categoryLinks}

    <section class="mt-8" aria-labelledby="summary-heading">
      <h2 id="summary-heading" class="text-xs font-semibold tracking-widest text-blue-700 uppercase">Summary</h2>
      <p class="mt-3 text-lg leading-8 text-slate-700">${escape(summary)}</p>
      ${tags}
    </section>

    <div class="mt-10 pt-6 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <p class="text-sm text-slate-500">Originally reported by ${escape(article.source)}.</p>
      <a href="${escape(original)}" target="_blank" rel="noopener" data-pagefind-ignore class="inline-flex items-center justify-center gap-x-2 bg-blue-900 hover:bg-blue-800 text-white text-sm font-semibold rounded-3xl px-6 py-3">
        Read the full story at ${escape(article.source)} <i class="fa-solid fa-arrow-up-right-from-square text-xs"></i>
      </a>
    </div>
  </article>

  <section class="mt-14" aria-labelledby="related-heading">
    <h2 id="related-heading" class="text-2xl font-bold tracking-tight">Related articles</h2>
    <ul class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
    ${relatedHtml}
    </ul>
  </section>
</main>`

  return shell(`${article.title} | Media Law News`, head, body)
}

export function renderNotFoundPage(): string {
  return shell(
    'Article not found | Media Law News',
    '<meta name="robots" content="noindex">',
    `<main class="max-w-4xl mx-auto px-6 py-24 text-center">
  <h1 class="heading-serif text-3xl">Article not found</h1>
  <p class="mt-4 text-slate-600">We couldn't find that story. It may not have been published on Media Law News.</p>
  <a href="/#news" class="inline-block mt-8 bg-blue-900 text-white rounded-3xl px-6 py-3 text-sm font-semibold">Browse the latest news</a>
</main>`
  )
}

export function renderCategoryPage(category: ArchiveCategory, result: CategoryPage): string {
  const { articles, total, page, totalPages, perPage } = result
  const label = CATEGORY_LABELS[category]
  const path = categoryPath(category, page)
  const crumbList: Crumb[] = [{ name: 'Home', path: '/' }, { name: 'Categories', path: '/category/' }]
  crumbList.push(page > 1 ? { name: label, path: categoryPath(category) } : { name: label })
  if (page > 1) crumbList.push({ name: `Page ${page}` })
  const crumbs = breadcrumbs(crumbList)
  const title = `${label}${page > 1 ? ` — Page ${page}` : ''} | Media Law News`
  const description = `${CATEGORY_DESCRIPTIONS[category]} Browse ${label} coverage from Media Law News.`

  const head = `<meta name="description" content="${escape(description)}">
<link rel="canonical" href="${SITE}${path}">
${page > 1 ? `<link rel="prev" href="${SITE}${categoryPath(category, page - 1)}">` : ''}
${page < totalPages ? `<link rel="next" href="${SITE}${categoryPath(category, page + 1)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Media Law News">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:url" content="${SITE}${path}">
${crumbs.jsonLd}`

  const cards = articles.map((a) => `<li>
      <article class="bg-white border border-slate-200 hover:border-blue-200 rounded-3xl p-6 transition">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span class="font-semibold text-blue-700">${escape(a.source)}</span>
          <time class="font-mono" datetime="${a.publishedAt.toISOString()}">${shortDate(a.publishedAt)}</time>
        </div>
        <h2 class="mt-2 text-xl font-semibold leading-snug"><a href="${escape(articlePath(a))}" class="hover:text-blue-800">${escape(a.title)}</a></h2>
        <p class="mt-3 text-sm leading-6 text-slate-600">${escape(truncate(a.summary || 'Read the original report for full details.', 260))}</p>
        <div class="mt-4 flex flex-wrap gap-2" data-pagefind-ignore>${categoryChips(archiveCategories(a), category)}</div>
      </article>
    </li>`).join('\n')

  const pageLink = (n: number, text: string, opts: { current?: boolean; rel?: string } = {}) => opts.current
    ? `<span aria-current="page" class="min-w-10 text-center px-3 py-2 rounded-2xl bg-blue-900 text-white text-sm font-semibold">${text}</span>`
    : `<a href="${categoryPath(category, n)}" ${opts.rel ? `rel="${opts.rel}"` : ''} class="min-w-10 text-center px-3 py-2 rounded-2xl border border-slate-200 bg-white text-sm text-blue-900 hover:bg-blue-50">${text}</a>`
  const numbers: (number | '…')[] = []
  for (let n = 1; n <= totalPages; n++) {
    if (n === 1 || n === totalPages || Math.abs(n - page) <= 2) numbers.push(n)
    else if (numbers[numbers.length - 1] !== '…') numbers.push('…')
  }
  const pagination = totalPages > 1 ? `<nav class="mt-10 flex flex-wrap items-center justify-center gap-2" aria-label="Pagination" data-pagefind-ignore>
    ${page > 1 ? pageLink(page - 1, '<i class="fa-solid fa-arrow-left text-xs"></i> Previous', { rel: 'prev' }) : ''}
    ${numbers.map((n) => n === '…' ? '<span class="px-2 text-slate-400">…</span>' : pageLink(n, String(n), { current: n === page })).join('')}
    ${page < totalPages ? pageLink(page + 1, 'Next <i class="fa-solid fa-arrow-right text-xs"></i>', { rel: 'next' }) : ''}
  </nav>` : ''

  const first = total ? (page - 1) * perPage + 1 : 0
  const last = first ? first + articles.length - 1 : 0

  const body = `<main class="max-w-4xl mx-auto px-6 py-12" data-pagefind-body>
  <span hidden data-pagefind-filter="type:Category page"></span>
  <span hidden data-pagefind-filter="category:${escape(label)}"></span>
  ${crumbs.html}
  <header>
    <p class="text-xs font-semibold tracking-widest text-blue-700 uppercase">Category</p>
    <h1 class="heading-serif mt-2 text-4xl text-slate-950">${escape(label)}</h1>
    <p class="mt-3 text-slate-600 leading-7">${escape(CATEGORY_DESCRIPTIONS[category])}</p>
    <p class="mt-2 text-sm text-slate-500" data-pagefind-ignore>${total ? `Showing ${first}–${last} of ${total} ${total === 1 ? 'article' : 'articles'} · Page ${page} of ${totalPages}` : 'No articles yet'}</p>
  </header>
  <nav class="mt-6 flex flex-wrap gap-2" aria-label="All categories" data-pagefind-ignore>${categoryChips(ARCHIVE_CATEGORIES, category)}</nav>
  ${cards ? `<ul class="mt-8 space-y-4" data-pagefind-weight="0.5">${cards}</ul>` : '<p class="mt-8 bg-white border border-slate-200 rounded-3xl p-6 text-slate-600">No articles are filed in this category yet. Check back soon.</p>'}
  ${pagination}
</main>`
  return shell(title, head, body)
}

export function renderCategoryIndex(counts: Record<ArchiveCategory, number>): string {
  const crumbs = breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Categories' }])
  const head = `<meta name="description" content="Browse Media Law News coverage by category: media law, First Amendment, entertainment law, privacy, defamation, journalism, technology law and the Supreme Court.">
<link rel="canonical" href="${SITE}/category/">
${crumbs.jsonLd}`
  const cards = ARCHIVE_CATEGORIES.map((c) => `<li><a href="${categoryPath(c)}" class="group block h-full bg-white border border-slate-200 hover:border-blue-200 rounded-3xl p-6 transition">
      <div class="flex items-baseline justify-between gap-3"><h2 class="text-lg font-semibold group-hover:text-blue-800">${escape(CATEGORY_LABELS[c])}</h2><span class="text-xs font-mono text-slate-500" data-pagefind-ignore>${counts[c]} ${counts[c] === 1 ? 'article' : 'articles'}</span></div>
      <p class="mt-2 text-sm leading-6 text-slate-600">${escape(CATEGORY_DESCRIPTIONS[c])}</p>
    </a></li>`).join('\n')
  const body = `<main class="max-w-4xl mx-auto px-6 py-12" data-pagefind-body>
  <span hidden data-pagefind-filter="type:Category page"></span>
  ${crumbs.html}
  <h1 class="heading-serif text-4xl text-slate-950">Categories</h1>
  <p class="mt-3 text-slate-600">Every story on Media Law News is automatically filed into one or more of these archives.</p>
  <ul class="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">${cards}</ul>
</main>`
  return shell('Categories | Media Law News', head, body)
}

export function archivePath(page = 1): string {
  return page > 1 ? `/archive/page/${page}/` : '/archive/'
}

// The full news archive: every article, newest first, with source, categories and date.
export function renderArchivePage(result: CategoryPage): string {
  const { articles, total, page, totalPages, perPage } = result
  const path = archivePath(page)
  const crumbList: Crumb[] = [{ name: 'Home', path: '/' }]
  crumbList.push(page > 1 ? { name: 'Archive', path: archivePath() } : { name: 'Archive' })
  if (page > 1) crumbList.push({ name: `Page ${page}` })
  const crumbs = breadcrumbs(crumbList)
  const title = `News Archive${page > 1 ? ` — Page ${page}` : ''} | Media Law News`
  const description = 'Every story covered by Media Law News, newest first: media law, First Amendment, entertainment law, privacy, defamation, journalism, technology law and Supreme Court news.'

  const head = `<meta name="description" content="${escape(description)}">
<link rel="canonical" href="${SITE}${path}">
${page > 1 ? `<link rel="prev" href="${SITE}${archivePath(page - 1)}">` : ''}
${page < totalPages ? `<link rel="next" href="${SITE}${archivePath(page + 1)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Media Law News">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:url" content="${SITE}${path}">
${crumbs.jsonLd}`

  const rows = articles.map((a) => `<li>
      <article class="bg-white border border-slate-200 hover:border-blue-200 rounded-3xl p-5 transition">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span><span class="sr-only">Source: </span><span class="font-semibold text-blue-700">${escape(a.source)}</span></span>
          <span aria-hidden="true" class="text-slate-300">·</span>
          <time class="font-mono" datetime="${a.publishedAt.toISOString()}">${shortDate(a.publishedAt)}</time>
        </div>
        <h2 class="mt-2 text-lg font-semibold leading-snug"><a href="${escape(articlePath(a))}" class="hover:text-blue-800">${escape(a.title)}</a></h2>
        <div class="mt-3 flex flex-wrap items-center gap-2" data-pagefind-ignore><span class="sr-only">Categories:</span>${categoryChips(archiveCategories(a))}</div>
      </article>
    </li>`).join('\n')

  const navLink = (n: number, html: string, rel: string) => `<a href="${archivePath(n)}" rel="${rel}" class="inline-flex items-center gap-x-2 px-4 py-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-blue-900 hover:bg-blue-50">${html}</a>`
  const disabled = (html: string) => `<span aria-disabled="true" class="inline-flex items-center gap-x-2 px-4 py-2 rounded-2xl border border-slate-100 bg-slate-50 text-sm font-semibold text-slate-300">${html}</span>`
  const prevHtml = '<i class="fa-solid fa-arrow-left text-xs"></i> Previous'
  const nextHtml = 'Next <i class="fa-solid fa-arrow-right text-xs"></i>'
  const pagination = totalPages > 1 ? `<nav class="mt-10 flex items-center justify-between gap-4" aria-label="Pagination" data-pagefind-ignore>
    ${page > 1 ? navLink(page - 1, prevHtml, 'prev') : disabled(prevHtml)}
    <span class="text-sm text-slate-500">Page ${page} of ${totalPages}</span>
    ${page < totalPages ? navLink(page + 1, nextHtml, 'next') : disabled(nextHtml)}
  </nav>` : ''

  const first = total ? (page - 1) * perPage + 1 : 0
  const last = first ? first + articles.length - 1 : 0

  const body = `<main class="max-w-4xl mx-auto px-6 py-12" data-pagefind-body>
  <span hidden data-pagefind-filter="type:Archive page"></span>
  ${crumbs.html}
  <header>
    <p class="text-xs font-semibold tracking-widest text-blue-700 uppercase">Archive</p>
    <h1 class="heading-serif mt-2 text-4xl text-slate-950">News Archive</h1>
    <p class="mt-3 text-slate-600 leading-7">Every story on Media Law News, newest first. Browse by topic on the <a href="/category/" class="text-blue-800 underline underline-offset-2">category pages</a>.</p>
    <p class="mt-2 text-sm text-slate-500" data-pagefind-ignore>${total ? `Showing ${first}–${last} of ${total} ${total === 1 ? 'article' : 'articles'} · Page ${page} of ${totalPages}` : 'No articles yet'}</p>
  </header>
  ${rows ? `<ol class="mt-8 space-y-3" data-pagefind-weight="0.5">${rows}</ol>` : '<p class="mt-8 bg-white border border-slate-200 rounded-3xl p-6 text-slate-600">No articles have been archived yet. Check back soon.</p>'}
  ${pagination}
</main>`
  return shell(title, head, body)
}
