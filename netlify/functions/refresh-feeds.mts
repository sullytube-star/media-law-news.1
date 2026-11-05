import type { Config } from '@netlify/functions'
import { refreshFeeds } from '../lib/feeds.ts'

// Re-fetches every RSS feed every 15 minutes and stores the result in Netlify Blobs.
export default async () => {
  const snapshot = await refreshFeeds()
  const failed = snapshot.feeds.filter((f) => f.status !== 'ok').map((f) => f.source)
  console.log(
    `[feeds] refreshed ${snapshot.feeds.length - failed.length}/${snapshot.feeds.length} feeds` +
      (failed.length ? `; failed: ${failed.join(', ')}` : '')
  )
}

export const config: Config = {
  schedule: '*/15 * * * *',
}
