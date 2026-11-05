import { getStore } from '@netlify/blobs'
import { XMLParser } from 'fast-xml-parser'

// Every feed the site is allowed to load. The pages pick the feeds they need
// from the cached snapshot by URL.
// `format: 'mandell-html'` marks a site with no RSS feed whose news listing
// page is scraped instead.
type FeedFormat = 'rss' | 'mandell-html'

export const FEEDS: { url: string; source: string; format?: FeedFormat }[] = [
  { url: 'https://www.scotusblog.com/feed/', source: 'SCOTUSblog' },
  { url: 'https://firstamendmentwatch.org/feed/', source: 'First Amendment Watch' },
  { url: 'https://www.rcfp.org/feed/', source: 'Reporters Committee (RCFP)' },
  { url: 'https://www.eff.org/rss/updates.xml', source: 'EFF Deeplinks' },
  { url: 'https://deadline.com/category/legal/feed/', source: 'Deadline Legal' },
  { url: 'https://epic.org/feed/', source: 'EPIC' },
  { url: 'https://www.insideprivacy.com/feed/', source: 'Covington Inside Privacy' },
  { url: 'https://eyeonprivacy.sheppardmullinplatform.com/feed/', source: 'Sheppard Mullin Eye on Privacy' },
  { url: 'https://harvardlawreview.org/feed/', source: 'Harvard Law Review' },
  { url: 'https://www.mandellpc.com/news', source: 'Mandell P.C.', format: 'mandell-html' },
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

function parseFeed(xml: string): FeedItem[] {
  const doc = parser.parse(xml)
  const rssItems = doc?.rss?.channel?.item ?? doc?.['rdf:RDF']?.item
  const atomEntries = doc?.feed?.entry

  let items: FeedItem[]
  if (Array.isArray(rssItems)) {
    items = rssItems.map((item: Record<string, unknown>) => ({
      title: plainText(item.title),
      link: textOf(item.link).trim(),
      pubDate: toIso(item.pubDate ?? item['dc:date']),
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

async function fetchOne(url: string, format: FeedFormat = 'rss'): Promise<FeedItem[]> {
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
  return format === 'mandell-html' ? parseMandellNews(body, url) : parseFeed(body)
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
    FEEDS.map(async ({ url, source, format }): Promise<FeedResult> => {
      try {
        const items = await fetchOne(url, format)
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
