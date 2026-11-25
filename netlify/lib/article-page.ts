import { articlePath, TOPIC_LABELS, type Article, type Topic } from './articles.ts'

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
    <a href="/#news" class="text-sm font-medium text-slate-600 hover:text-blue-800">Latest news</a>
  </div>
</header>
${body}
<footer class="border-t border-slate-200 bg-white">
  <div class="max-w-4xl mx-auto px-6 py-8 text-xs text-slate-500">Media Law News aggregates coverage from independent publishers. Headlines and summaries belong to their original sources.</div>
</footer>
</body>
</html>`
}

export function renderArticlePage(article: Article, related: Article[]): string {
  const path = articlePath(article)
  const url = `${SITE}${path}`
  const topic = article.topic as Topic
  const original = safeHttpUrl(article.sourceUrl)
  const summary = article.summary || 'Read the original report for full details.'
  const description = summary.length > 160 ? summary.slice(0, 157).replace(/\s+\S*$/, '') + '…' : summary

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
    keywords: article.categories.join(', ') || undefined,
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
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`

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

  const tags = article.categories.length
    ? `<ul class="mt-6 flex flex-wrap gap-2">${article.categories
        .map((t) => `<li class="text-xs bg-slate-100 text-slate-600 rounded-full px-3 py-1">${escape(t)}</li>`)
        .join('')}</ul>`
    : ''

  const body = `<main class="max-w-4xl mx-auto px-6 py-12">
  <nav class="text-xs text-slate-500 mb-6" aria-label="Breadcrumb"><a href="/" class="hover:text-blue-800">Home</a> <span class="mx-1">/</span> <a href="/#news" class="hover:text-blue-800">News</a> <span class="mx-1">/</span> <span>${escape(article.year)}</span></nav>
  <article class="bg-white border border-slate-200 rounded-3xl p-8 md:p-12">
    <div class="flex flex-wrap items-center gap-3">
      <span class="category-tag ${TOPIC_COLORS[topic] ?? 'bg-slate-100 text-slate-700'}">${escape(TOPIC_LABELS[topic] ?? 'News')}</span>
      <time class="text-sm text-slate-500" datetime="${article.publishedAt.toISOString()}">${longDate(article.publishedAt)}</time>
    </div>
    <h1 class="heading-serif mt-5 text-3xl md:text-4xl leading-tight text-slate-950">${escape(article.title)}</h1>
    <p class="mt-4 text-sm text-slate-600">Source: <span class="font-semibold text-slate-800">${escape(article.source)}</span></p>

    <section class="mt-8" aria-labelledby="summary-heading">
      <h2 id="summary-heading" class="text-xs font-semibold tracking-widest text-blue-700 uppercase">Summary</h2>
      <p class="mt-3 text-lg leading-8 text-slate-700">${escape(summary)}</p>
      ${tags}
    </section>

    <div class="mt-10 pt-6 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <p class="text-sm text-slate-500">Originally reported by ${escape(article.source)}.</p>
      <a href="${escape(original)}" target="_blank" rel="noopener" class="inline-flex items-center justify-center gap-x-2 bg-blue-900 hover:bg-blue-800 text-white text-sm font-semibold rounded-3xl px-6 py-3">
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
