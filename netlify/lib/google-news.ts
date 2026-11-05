import { getStore } from '@netlify/blobs'
import { XMLParser } from 'fast-xml-parser'

// Daily Google News search results for the site's five practice areas.
// Each topic runs one or more Google News RSS searches limited to the last
// 24 hours; the results are merged, de-duplicated and capped at MAX_RESULTS.

export type Topic = 'First Amendment' | 'Media Law' | 'Entertainment Law' | 'Defamation' | 'Privacy'

export const TOPIC_QUERIES: { topic: Topic; queries: string[] }[] = [
  {
    topic: 'First Amendment',
    queries: ['"first amendment"', '("free speech" OR "freedom of speech") (court OR judge OR lawsuit OR ruling)'],
  },
  {
    topic: 'Media Law',
    queries: [
      '"media law" OR "press freedom" OR "freedom of the press"',
      '"shield law" OR "prior restraint" OR "media lawsuit" OR "FCC license" OR "broadcast license"',
      '(journalist OR journalists OR "news outlet" OR newsroom) (subpoena OR arrested OR lawsuit OR "press access")',
    ],
  },
  {
    topic: 'Entertainment Law',
    queries: [
      '"entertainment law" OR "entertainment lawyer" OR "entertainment attorney" OR "entertainment litigation"',
      '(Hollywood OR studio OR streaming OR "record label") (lawsuit OR sued)',
      '(music OR film OR TV) "copyright infringement" lawsuit',
    ],
  },
  {
    topic: 'Defamation',
    queries: ['defamation OR libel OR slander'],
  },
  {
    topic: 'Privacy',
    queries: [
      '"privacy law" OR "data privacy" OR "privacy lawsuit" OR "invasion of privacy" OR "privacy class action"',
      '(privacy OR "data protection") (regulator OR fine OR ruling OR lawsuit OR settlement)',
    ],
  },
]

export const MAX_RESULTS = 100
const FETCH_TIMEOUT_MS = 15_000
const STORE_NAME = 'google-news'
const LATEST_KEY = 'latest'
const DAY_PREFIX = 'day/'

export type GoogleNewsItem = {
  title: string
  link: string // Google News article URL (redirects to the publisher)
  source: string // publisher name
  sourceUrl: string // publisher home page
  pubDate: string // ISO 8601, or ''
  topics: Topic[] // every topic whose search returned this story
}

export type GoogleNewsSnapshot = {
  date: string // YYYY-MM-DD (UTC) the results were pulled
  updatedAt: string
  total: number
  counts: Record<Topic, number>
  errors: { topic: Topic; query: string; message: string }[]
  items: GoogleNewsItem[]
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  htmlEntities: true,
  isArray: (name) => name === 'item',
})

function textOf(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return textOf(value[0])
  if (typeof value === 'object') return textOf((value as Record<string, unknown>)['#text'])
  return String(value)
}

function searchUrl(query: string): string {
  const q = encodeURIComponent(`${query} when:1d`)
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`
}

async function search(query: string): Promise<Omit<GoogleNewsItem, 'topics'>[]> {
  const res = await fetch(searchUrl(query), {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 MediaLawNews/1.0',
      Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const doc = parser.parse(await res.text())
  const items = doc?.rss?.channel?.item
  if (!doc?.rss) throw new Error('Response is not an RSS feed')
  if (!Array.isArray(items)) return []

  return items
    .map((item: Record<string, any>) => {
      const source = textOf(item.source).trim()
      let title = textOf(item.title).replace(/\s+/g, ' ').trim()
      // Google appends " - Publisher" to every headline.
      if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim()
      const date = new Date(textOf(item.pubDate))
      return {
        title,
        link: textOf(item.link).trim(),
        source,
        sourceUrl: typeof item.source === 'object' ? String(item.source['@_url'] ?? '') : '',
        pubDate: Number.isNaN(date.getTime()) ? '' : date.toISOString(),
      }
    })
    .filter((item) => item.title && /^https?:\/\//i.test(item.link))
}

function titleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// Runs every search, merges duplicates (a story can match several topics),
// and picks up to MAX_RESULTS stories, taking them round-robin by topic so a
// busy topic like defamation can't crowd out the others.
export async function pullGoogleNews(): Promise<GoogleNewsSnapshot> {
  const now = new Date()
  const errors: GoogleNewsSnapshot['errors'] = []

  const perTopic = await Promise.all(
    TOPIC_QUERIES.map(async ({ topic, queries }) => {
      const results = await Promise.all(
        queries.map((query) =>
          search(query).catch((error) => {
            const message = error instanceof Error ? error.message : String(error)
            console.warn(`[google-news] ${topic} query failed (${query}): ${message}`)
            errors.push({ topic, query, message })
            return []
          })
        )
      )
      const newestFirst = results
        .flat()
        .sort((a, b) => (b.pubDate || '').localeCompare(a.pubDate || ''))
      return { topic, items: newestFirst }
    })
  )

  if (errors.length === TOPIC_QUERIES.reduce((n, t) => n + t.queries.length, 0)) {
    throw new Error('Every Google News search failed')
  }

  // Map every story to all topics it appeared under.
  const byKey = new Map<string, GoogleNewsItem>()
  for (const { topic, items } of perTopic) {
    for (const item of items) {
      const key = titleKey(item.title)
      const existing = byKey.get(key)
      if (existing) {
        if (!existing.topics.includes(topic)) existing.topics.push(topic)
      } else {
        byKey.set(key, { ...item, topics: [topic] })
      }
    }
  }

  // Round-robin selection across topics.
  const queues = perTopic.map(({ items }) => items.map((i) => byKey.get(titleKey(i.title))!))
  const chosen = new Set<GoogleNewsItem>()
  let progressed = true
  while (chosen.size < MAX_RESULTS && progressed) {
    progressed = false
    for (const queue of queues) {
      while (queue.length && chosen.has(queue[0])) queue.shift()
      const next = queue.shift()
      if (next) {
        chosen.add(next)
        progressed = true
        if (chosen.size >= MAX_RESULTS) break
      }
    }
  }

  const items = [...chosen].sort((a, b) => (b.pubDate || '').localeCompare(a.pubDate || ''))
  const counts = Object.fromEntries(
    TOPIC_QUERIES.map(({ topic }) => [topic, items.filter((i) => i.topics.includes(topic)).length])
  ) as Record<Topic, number>

  return {
    date: now.toISOString().slice(0, 10),
    updatedAt: now.toISOString(),
    total: items.length,
    counts,
    errors,
    items,
  }
}

function store() {
  return getStore(STORE_NAME)
}

export async function readLatest(): Promise<GoogleNewsSnapshot | null> {
  return (await store().get(LATEST_KEY, { type: 'json' })) as GoogleNewsSnapshot | null
}

export async function readDay(date: string): Promise<GoogleNewsSnapshot | null> {
  return (await store().get(DAY_PREFIX + date, { type: 'json' })) as GoogleNewsSnapshot | null
}

export async function listDays(): Promise<string[]> {
  const { blobs } = await store().list({ prefix: DAY_PREFIX })
  return blobs.map((b) => b.key.slice(DAY_PREFIX.length)).sort().reverse()
}

// Pulls today's results and saves them as both "latest" and that day's entry,
// so past days stay browsable.
export async function refreshGoogleNews(): Promise<GoogleNewsSnapshot> {
  const snapshot = await pullGoogleNews()
  await Promise.all([
    store().setJSON(LATEST_KEY, snapshot),
    store().setJSON(DAY_PREFIX + snapshot.date, snapshot),
  ])
  return snapshot
}
