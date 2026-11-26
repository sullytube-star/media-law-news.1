import { getStore } from '@netlify/blobs'
import { XMLParser } from 'fast-xml-parser'

// Every feed the site is allowed to load. The pages pick the feeds they need
// from the cached snapshot by URL.
// `format: 'mandell-html'`, `format: 'newsweek-topic'` and the law-firm formats
// (`dwt-insights`, `ballard-insights`, `cahill-news`, `duane-morris-pubs`) mark
// sites with no RSS feed whose listing page (or its data file) is read instead.
type FeedFormat =
  | 'rss'
  | 'mandell-html'
  | 'newsweek-topic'
  | 'dwt-insights'
  | 'ballard-insights'
  | 'cahill-news'
  | 'duane-morris-pubs'

// Matches stories on the site's beat. General-news feeds set `onTopic: true`
// so only their media, speech, privacy and entertainment stories are kept.
// `onTopic: 'strict'` (used for law-firm news pages) checks only the title and
// summary, because firm labels such as "In the Media" or "Media Coverage"
// would otherwise let every item through.
const ON_TOPIC = /\b(first amendment|free speech|free press|freedom of (the )?press|press freedom|speech|censor\w*|defamation|defam\w+|libel\w*|slander|privacy|surveillance|copyright\w*|trademark\w*|right of publicity|intellectual property|entertainment|music\w*|musician|record label|film\w*|movie\w*|hollywood|studio|streaming|broadcast\w*|television|tv|netflix|disney|journalis\w+|reporters?|newspapers?|news media|media|publish\w*|social media|section 230|book ban\w*|celebrit\w+|actors?|actress|singer|rapper|artists?|sag-aftra|iatse|anti-slapp|foia|public records)\b/i

// `linkPrefix` keeps only stories whose link starts with that URL, for
// sections that have no feed of their own but appear in a broader one.
export const FEEDS: { url: string; source: string; format?: FeedFormat; onTopic?: boolean | 'strict'; linkPrefix?: string }[] = [
  { url: 'https://www.scotusblog.com/feed/', source: 'SCOTUSblog' },
  { url: 'https://firstamendmentwatch.org/feed/', source: 'First Amendment Watch' },
  // Official RSS for nytimes.com/topic/subject/first-amendment-us-constitution
  // (the topic page itself blocks automated requests).
  { url: 'https://www.nytimes.com/svc/collections/v1/publish/https://www.nytimes.com/topic/subject/first-amendment-us-constitution/rss.xml', source: 'New York Times · First Amendment' },
  // Newsweek has no RSS feed for its topic pages, so the page is scraped.
  { url: 'https://www.newsweek.com/topic/first-amendment', source: 'Newsweek · First Amendment', format: 'newsweek-topic' },
  { url: 'https://www.rcfp.org/feed/', source: 'Reporters Committee (RCFP)' },
  { url: 'https://www.eff.org/rss/updates.xml', source: 'EFF Deeplinks' },
  { url: 'https://deadline.com/category/legal/feed/', source: 'Deadline Legal' },
  { url: 'https://epic.org/feed/', source: 'EPIC' },
  { url: 'https://www.insideprivacy.com/feed/', source: 'Covington Inside Privacy' },
  { url: 'https://eyeonprivacy.sheppardmullinplatform.com/feed/', source: 'Sheppard Mullin Eye on Privacy' },
  { url: 'https://harvardlawreview.org/feed/', source: 'Harvard Law Review' },
  { url: 'https://www.billboard.com/c/business/legal/feed/', source: 'Billboard Legal' },
  { url: 'https://www.law360.com/media/rss', source: 'Law360 Media & Entertainment' },
  { url: 'https://www.hollywoodreporter.com/e/thr-esq/feed/', source: 'THR Lawsuits' },
  { url: 'https://deadline.com/tag/sag-aftra/feed/', source: 'Deadline SAG-AFTRA' },
  { url: 'https://deadline.com/tag/iatse/feed/', source: 'Deadline IATSE' },
  { url: 'https://completemusicupdate.com/feed/', source: 'CMU' },
  { url: 'https://www.digitalmusicnews.com/feed/', source: 'Digital Music News' },
  { url: 'https://www.billboard.com/t/live-nation/feed/', source: 'Billboard Live Nation' },
  { url: 'https://broadwaynews.com/feed/', source: 'Broadway News' },
  { url: 'https://www.mandellpc.com/news', source: 'Mandell P.C.', format: 'mandell-html' },
  // Courthouse News Service site-wide feed covers all news, so it is filtered to on-topic stories.
  { url: 'https://www.courthousenews.com/feed/', source: 'Courthouse News', onTopic: true },
  // Courthouse News Service category feeds (WordPress /feed/ for each category page).
  { url: 'https://www.courthousenews.com/category/media/feed/', source: 'Courthouse News · Media' },
  { url: 'https://www.courthousenews.com/category/entertainment/feed/', source: 'Courthouse News · Entertainment' },
  { url: 'https://www.courthousenews.com/category/civil-rights/feed/', source: 'Courthouse News · Civil Rights' },
  { url: 'https://www.courthousenews.com/category/appeals/feed/', source: 'Courthouse News · Appeals' },
  // VERDICT News covers all legal news, so it is filtered to on-topic stories.
  { url: 'https://verdict.news/rss', source: 'VERDICT News', onTopic: true },
  // Above the Law covers all legal industry news, so it is filtered to on-topic stories.
  { url: 'https://abovethelaw.com/feed/', source: 'Above the Law', onTopic: true },
  // WSJ has no feed for wsj.com/us-news/law, so its official U.S. News feed is
  // narrowed to stories published in the Law section.
  {
    url: 'https://feeds.content.dowjones.io/public/rss/RSSUSnews',
    source: 'Wall Street Journal · Law',
    linkPrefix: 'https://www.wsj.com/us-news/law/',
  },
  // New York Times home page feed covers all news, so it is filtered to on-topic stories.
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', source: 'New York Times', onTopic: true },
  // TMZ's Legal category feed: celebrity lawsuits, trials and court filings.
  { url: 'https://www.tmz.com/category/legal/rss.xml', source: 'TMZ Legal' },
  // Law firm news and insights. These firms publish on every practice area,
  // so each is filtered to stories on the site's beat.
  // Davis Wright Tremaine insights listing (no RSS); the page embeds its results as JSON.
  { url: 'https://www.dwt.com/insights?islanding=true&searchtype=12&take=25', source: 'Davis Wright Tremaine', format: 'dwt-insights', onTopic: 'strict' },
  // Ballard Spahr insights listing (no RSS), scraped from the page.
  { url: 'https://www.ballardspahr.com/insights', source: 'Ballard Spahr', format: 'ballard-insights', onTopic: 'strict' },
  // Gibson Dunn's WordPress feed narrowed to the Accolades, Firm News and In the
  // Media categories shown on its insights archive page.
  { url: 'https://www.gibsondunn.com/feed/?category_name=accolades,firm-news,in-the-media', source: 'Gibson Dunn', onTopic: 'strict' },
  // Cahill Gordon & Reindel recent news (no RSS), scraped from the page.
  { url: 'https://www.cahill.com/news', source: 'Cahill Gordon & Reindel', format: 'cahill-news', onTopic: 'strict' },
  // Duane Morris "Recent News and Publications" page loads this JSON listing.
  { url: 'https://www.duanemorris.com/resources/data/publicationlistings_ALLSHORT.json', source: 'Duane Morris', format: 'duane-morris-pubs', onTopic: 'strict' },
  // U.S. Copyright Office (Library of Congress) feeds.
  { url: 'https://www.loc.gov/rss/copyright/rss.xml', source: 'U.S. Copyright Office · Updates' },
  { url: 'https://www.loc.gov/rss/copyright/fedreg.xml', source: 'U.S. Copyright Office · Federal Register' },
  { url: 'https://www.loc.gov/rss/copyright/legislation.xml', source: 'U.S. Copyright Office · Legislation' },
]

const MAX_ITEMS_PER_FEED = 25
const MAX_DESCRIPTION_CHARS = 1500
const FETCH_TIMEOUT_MS = 15_000
const STORE_NAME = 'rss-feeds'
const SNAPSHOT_KEY = 'snapshot'

export type FeedItem = {
  title: string
  link: string
  pubDate: string // ISO 8601, or '' when the feed gives no date
  author: string
  description: string // plain text
  categories: string[]
}

export type FeedResult = {
  url: string
  source: string
  status: 'ok' | 'error'
  message?: string
  fetchedAt: string // when items were last fetched successfully
  checkedAt: string // when the feed was last attempted
  items: FeedItem[]
}

export type Snapshot = {
  updatedAt: string
  feeds: FeedResult[]
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  htmlEntities: true,
  isArray: (name) => ['item', 'entry', 'category', 'link'].includes(name),
})

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match
    }
    return ENTITIES[code.toLowerCase()] ?? match
  })
}

function plainText(value: unknown): string {
  const html = textOf(value)
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()
}

function textOf(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return textOf(value[0])
  if (typeof value === 'object') return textOf((value as Record<string, unknown>)['#text'])
  return String(value)
}

function toIso(value: unknown): string {
  const raw = textOf(value).trim()
  if (!raw) return ''
  const t = new Date(raw)
  return Number.isNaN(t.getTime()) ? '' : t.toISOString()
}

function atomLink(links: unknown): string {
  if (!Array.isArray(links)) return textOf(links)
  const pick =
    links.find((l) => typeof l === 'object' && (l['@_rel'] ?? 'alternate') === 'alternate') ?? links[0]
  return typeof pick === 'object' ? String(pick['@_href'] ?? '') : String(pick ?? '')
}

function parseFeed(xml: string, linkPrefix?: string): FeedItem[] {
  const doc = parser.parse(xml)
  const rssItems = doc?.rss?.channel?.item ?? doc?.['rdf:RDF']?.item
  const atomEntries = doc?.feed?.entry

  let items: FeedItem[]
  if (Array.isArray(rssItems)) {
    // Items with no date of their own fall back to the channel's build date,
    // so old undated items are not shown as brand-new.
    const channelDate = doc?.rss?.channel?.lastBuildDate ?? doc?.rss?.channel?.pubDate
    items = rssItems.map((item: Record<string, unknown>) => ({
      title: plainText(item.title),
      link: textOf(item.link).trim(),
      pubDate: toIso(item.pubDate ?? item['dc:date'] ?? channelDate),
      author: plainText(item['dc:creator'] ?? item.author),
      description: plainText(item.description) || plainText(item['content:encoded']),
      categories: ((item.category as unknown[]) ?? []).map(plainText).filter(Boolean),
    }))
  } else if (Array.isArray(atomEntries)) {
    items = atomEntries.map((entry: Record<string, any>) => ({
      title: plainText(entry.title),
      link: atomLink(entry.link).trim(),
      pubDate: toIso(entry.published ?? entry.updated),
      author: plainText(entry.author?.name),
      description: plainText(entry.summary) || plainText(entry.content),
      categories: ((entry.category as any[]) ?? [])
        .map((c) => (typeof c === 'object' ? String(c['@_term'] ?? '') : String(c)))
        .filter(Boolean),
    }))
  } else if (doc?.rss || doc?.feed) {
    items = [] // a valid feed that simply has no items
  } else {
    throw new Error('Response is not an RSS or Atom feed')
  }

  // Narrow to one section before the per-feed item cap is applied.
  if (linkPrefix) items = items.filter((item) => item.link.startsWith(linkPrefix))
  return finishItems(items)
}

function finishItems(items: FeedItem[]): FeedItem[] {
  return items
    .filter((item) => item.title && /^https?:\/\//i.test(item.link))
    .map((item) => ({
      ...item,
      description:
        item.description.length > MAX_DESCRIPTION_CHARS
          ? item.description.slice(0, MAX_DESCRIPTION_CHARS).trimEnd() + '…'
          : item.description,
    }))
    .slice(0, MAX_ITEMS_PER_FEED)
}

// Mandell P.C. (mandellpc.com/news) has no RSS feed. Each story on the
// listing page is a card: a link wrapping an <h2> title, a <p> with the date,
// then a <div> with the summary paragraphs.
function parseMandellNews(html: string, pageUrl: string): FeedItem[] {
  const card =
    /<a\b[^>]*href="(\/news\/[^"#?]+)"[^>]*>\s*<h2\b[^>]*>([\s\S]*?)<\/h2>\s*<\/a>\s*<p\b[^>]*>([\s\S]*?)<\/p>\s*<div\b[^>]*>([\s\S]*?)<\/div>/gi
  const items: FeedItem[] = []
  const seen = new Set<string>()
  for (const m of html.matchAll(card)) {
    const link = new URL(m[1], pageUrl).toString()
    if (seen.has(link)) continue
    seen.add(link)
    items.push({
      title: plainText(m[2]),
      link,
      pubDate: toIso(plainText(m[3])),
      author: 'Mandell P.C.',
      description: plainText(m[4]),
      categories: [],
    })
  }
  if (!items.length) throw new Error('No news stories found on the page')
  return finishItems(items)
}

// Newsweek topic pages (newsweek.com/topic/...) have no RSS feed. The page is a
// Next.js app whose story list is embedded as JSON in `self.__next_f.push`
// script chunks; each story has a link, a GMT publish date, a title, an
// excerpt and its authors.
const JSON_STRING = String.raw`"(?:[^"\\]|\\.)*"`
const NEWSWEEK_POST = new RegExp(
  String.raw`"link":"(https://www\.newsweek\.com/[^"]+)","dateGmt":"([^"]*)"[\s\S]*?"content":\{"title":(${JSON_STRING}),"headlineOverride":(null|${JSON_STRING}),"excerpt":(null|${JSON_STRING})`,
  'g'
)
const NEWSWEEK_AUTHOR = new RegExp(String.raw`"authors":\[\{[^{}]*?"name":(${JSON_STRING})`)

function parseNewsweekTopic(html: string): FeedItem[] {
  let data = ''
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try {
      data += JSON.parse(m[1])
    } catch {
      // skip chunks that aren't plain JSON strings
    }
  }

  const matches = [...data.matchAll(NEWSWEEK_POST)]
  const items: FeedItem[] = []
  const seen = new Set<string>()
  matches.forEach((m, i) => {
    const link = m[1]
    if (seen.has(link)) return
    seen.add(link)
    const rest = data.slice(m.index, matches[i + 1]?.index ?? m.index + 5000)
    const author = rest.match(NEWSWEEK_AUTHOR)
    const date = m[2] ? `${m[2]}Z` : ''
    items.push({
      title: plainText(JSON.parse(m[4]) ?? JSON.parse(m[3])),
      link,
      pubDate: toIso(date),
      author: author ? plainText(JSON.parse(author[1])) : 'Newsweek',
      description: plainText(JSON.parse(m[5]) ?? ''),
      categories: [],
    })
  })
  if (!items.length) throw new Error('No stories found on the Newsweek topic page')
  return finishItems(items)
}

// Upcoming events (speaking engagements, webinars) carry future dates; they
// are left out so they don't sit at the top of the news feed.
function notUpcoming(items: FeedItem[]): FeedItem[] {
  const now = Date.now()
  return items.filter((item) => !item.pubDate || new Date(item.pubDate).getTime() <= now)
}

function requireItems(items: FeedItem[], source: string): FeedItem[] {
  if (!items.length) throw new Error(`No stories found on the ${source} page`)
  return items
}

// Davis Wright Tremaine (dwt.com/insights): the results are a JSON object in
// the `v-bind:initial-state` attribute of the insights-search component.
// Dates are MM.DD.YY.
function parseDwtInsights(html: string, pageUrl: string): FeedItem[] {
  const attr = html.match(/v-bind:initial-state="([^"]*)"/)
  if (!attr) throw new Error('No insights data found on the DWT page')
  const state = JSON.parse(decodeEntities(attr[1]))
  const results: any[] = state?.response?.results ?? []
  const items = results.map((r): FeedItem => {
    const d = String(r.date ?? '').match(/^(\d{2})\.(\d{2})\.(\d{2})$/)
    return {
      title: plainText(r.title),
      link: r.link?.Url ? new URL(r.link.Url, pageUrl).toString() : '',
      pubDate: d ? toIso(`20${d[3]}-${d[1]}-${d[2]}T12:00:00Z`) : '',
      author: 'Davis Wright Tremaine',
      description: plainText(r.abstractText ?? ''),
      categories: [r.type, r.category].map((c) => plainText(c ?? '')).filter(Boolean),
    }
  })
  return finishItems(notUpcoming(requireItems(items, 'DWT insights')))
}

// "March 2 12:00 PM - March 6 4:30 PM, 2027" or "November 24, 2026" -> first day.
function firstDate(text: string): string {
  const m = text.match(/([A-Z][a-z]+)\s+(\d{1,2})\b/)
  const year = text.match(/\b(\d{4})\b/)
  return m && year ? toIso(`${m[1]} ${m[2]}, ${year[1]} 12:00 UTC`) : ''
}

// Ballard Spahr (ballardspahr.com/insights): each result is a list item with an
// eyebrow ("Type | Date"), a title link and an abstract.
function parseBallardInsights(html: string, pageUrl: string): FeedItem[] {
  const card =
    /SearchResultListItem__eyebrow">([\s\S]*?)<\/div>\s*<a\b[^>]*href="([^"]+)"[^>]*>\s*<div class="SearchResultListItem__title">([\s\S]*?)<\/div>\s*<\/a>\s*(?:<div class="SearchResultListItem__abstract">([\s\S]*?)<\/div>)?/gi
  const items: FeedItem[] = []
  for (const m of html.matchAll(card)) {
    const [type, ...rest] = plainText(m[1]).split('|').map((s) => s.trim())
    items.push({
      title: plainText(m[3]),
      link: new URL(m[2], pageUrl).toString(),
      pubDate: firstDate(rest.join(' ')),
      author: 'Ballard Spahr',
      description: plainText(m[4] ?? ''),
      categories: type ? [type] : [],
    })
  }
  return finishItems(notUpcoming(requireItems(items, 'Ballard Spahr insights')))
}

// Cahill (cahill.com/news): a list of items, each with a type and date line
// followed by the title link. There is no summary on the listing page.
function parseCahillNews(html: string, pageUrl: string): FeedItem[] {
  const card =
    /<span class="type-date"><a\b[^>]*class="news-type"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)<\/span>\s*<a\b[^>]*href="([^"]+)"[^>]*class="title"[^>]*>([\s\S]*?)<\/a>/gi
  const items: FeedItem[] = []
  const seen = new Set<string>()
  for (const m of html.matchAll(card)) {
    const link = new URL(m[3], pageUrl).toString()
    if (seen.has(link)) continue
    seen.add(link)
    items.push({
      title: plainText(m[4]),
      link,
      pubDate: firstDate(plainText(m[2])),
      author: 'Cahill Gordon & Reindel',
      description: '',
      categories: [plainText(m[1])].filter(Boolean),
    })
  }
  return finishItems(notUpcoming(requireItems(items, 'Cahill news')))
}

// Duane Morris (duanemorris.com/site/listings/recentnewsandpubs.html) renders
// its list from this JSON file: headline, epoch-ms issue date and an HTML link.
const DUANE_MORRIS_TYPES: Record<string, string> = {
  BLA: 'Article', CLA: 'Alert', CLP: 'In the News', PRL: 'Press Release',
}

function parseDuaneMorrisPubs(body: string, pageUrl: string): FeedItem[] {
  const data = JSON.parse(body)
  const list: any[] = Array.isArray(data?.items) ? data.items : []
  const items = list.map((p): FeedItem => {
    const href = String(p.linkDescription ?? '').match(/href=['"]([^'"]+)['"]/)
    const date = Number(p.issueDate)
    return {
      title: plainText(p.headline),
      link: href ? new URL(decodeEntities(href[1]), pageUrl).toString() : '',
      pubDate: Number.isFinite(date) && date > 0 ? new Date(date).toISOString() : toIso(p.issueDateText),
      author: plainText(p.authorText ?? '').replace(/^By\s+/i, '') || 'Duane Morris',
      description: '',
      categories: [DUANE_MORRIS_TYPES[p.type] ?? '', plainText(p.reprintSource?.name ?? '')].filter(Boolean),
    }
  })
  return finishItems(notUpcoming(requireItems(items, 'Duane Morris')))
}

async function fetchOne(url: string, format: FeedFormat = 'rss', linkPrefix?: string): Promise<FeedItem[]> {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      // Some publishers reject requests that don't look like a browser.
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 MediaLawNews/1.0',
      Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.8',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.text()
  if (format === 'mandell-html') return parseMandellNews(body, url)
  if (format === 'newsweek-topic') return parseNewsweekTopic(body)
  if (format === 'dwt-insights') return parseDwtInsights(body, url)
  if (format === 'ballard-insights') return parseBallardInsights(body, url)
  if (format === 'cahill-news') return parseCahillNews(body, url)
  if (format === 'duane-morris-pubs') return parseDuaneMorrisPubs(body, 'https://www.duanemorris.com/')
  return parseFeed(body, linkPrefix)
}

function store() {
  return getStore(STORE_NAME)
}

export async function readSnapshot(): Promise<Snapshot | null> {
  return (await store().get(SNAPSHOT_KEY, { type: 'json' })) as Snapshot | null
}

// Fetches every feed and saves the snapshot. When a feed fails, its last
// successful items are kept so a temporary outage doesn't empty the site.
export async function refreshFeeds(): Promise<Snapshot> {
  const previous = await readSnapshot().catch(() => null)
  const previousByUrl = new Map((previous?.feeds ?? []).map((f) => [f.url, f]))
  const now = new Date().toISOString()

  const feeds = await Promise.all(
    FEEDS.map(async ({ url, source, format, onTopic, linkPrefix }): Promise<FeedResult> => {
      try {
        let items = await fetchOne(url, format, linkPrefix)
        if (onTopic === 'strict') items = items.filter((i) => ON_TOPIC.test(`${i.title} ${i.description.slice(0, 600)}`))
        else if (onTopic) items = items.filter((i) => ON_TOPIC.test(`${i.title} ${i.description.slice(0, 600)} ${i.categories.join(' ')}`))
        return { url, source, status: 'ok', fetchedAt: now, checkedAt: now, items }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`[feeds] ${source} failed: ${message}`)
        const old = previousByUrl.get(url)
        return {
          url,
          source,
          status: 'error',
          message,
          fetchedAt: old?.fetchedAt ?? '',
          checkedAt: now,
          items: old?.items ?? [],
        }
      }
    })
  )

  const snapshot: Snapshot = { updatedAt: now, feeds }
  await store().setJSON(SNAPSHOT_KEY, snapshot)
  return snapshot
}
