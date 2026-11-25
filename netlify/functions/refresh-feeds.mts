import type { Config } from '@netlify/functions'
import { refreshFeeds } from '../lib/feeds.ts'
import { archiveSnapshot } from '../lib/articles.ts'

// Re-fetches every RSS feed every 15 minutes, stores the result in Netlify
// Blobs, and gives every new story its permanent article page.
export default async () => {
  const snapshot = await refreshFeeds()
  const failed = snapshot.feeds.filter((f) => f.status !== 'ok').map((f) => f.source)
  console.log(
    `[feeds] refreshed ${snapshot.feeds.length - failed.length}/${snapshot.feeds.length} feeds` +
      (failed.length ? `; failed: ${failed.join(', ')}` : '')
  )
  const paths = await archiveSnapshot(snapshot)
  console.log(`[articles] ${paths.size} stories have permanent pages`)
}

export const config: Config = {
  schedule: '*/15 * * * *',
}
