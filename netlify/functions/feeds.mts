import type { Config } from '@netlify/functions'
import { readSnapshot, refreshFeeds } from '../lib/feeds.ts'
import { archiveSnapshot } from '../lib/articles.ts'
import { CURATED_STORIES } from '../lib/curated.ts'

// If the scheduled refresh hasn't run for this long (e.g. right after the
// first deploy), refresh on demand instead of serving stale data.
const MAX_AGE_MS = 60 * 60 * 1000

export default async () => {
  let snapshot = await readSnapshot().catch(() => null)
  const age = snapshot ? Date.now() - new Date(snapshot.updatedAt).getTime() : Infinity

  if (!snapshot || !(age < MAX_AGE_MS)) {
    try {
      snapshot = await refreshFeeds()
    } catch (error) {
      console.error('[feeds] on-demand refresh failed', error)
      if (!snapshot) {
        return Response.json({ error: 'Feeds are unavailable right now' }, { status: 503 })
      }
    }
  }

  // Attach each story's permanent page. Stories seen for the first time are
  // archived here, so every item the homepage shows has a working URL.
  let permalinks = new Map<string, string>()
  try {
    permalinks = await archiveSnapshot(snapshot)
  } catch (error) {
    console.error('[articles] could not assign permalinks', error)
  }

  const feeds = snapshot.feeds.map((feed) => ({
    ...feed,
    items: feed.items.map((item) => ({ ...item, permalink: permalinks.get(item.link) ?? null })),
  }))
  const curated = CURATED_STORIES.map((story) => ({ link: story.link, permalink: permalinks.get(story.link) ?? null }))

  return Response.json(
    { updatedAt: snapshot.updatedAt, feeds, curated },
    {
      headers: {
        'Cache-Control': 'public, max-age=60',
        'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=300, stale-while-revalidate=600',
      },
    }
  )
}

export const config: Config = {
  path: '/api/feeds',
  method: 'GET',
}
