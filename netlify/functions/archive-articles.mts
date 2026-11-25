import type { Config } from '@netlify/functions'
import { archiveSnapshot } from '../lib/articles.ts'
import { readSnapshot } from '../lib/feeds.ts'

// Keep a durable archive before feed windows roll forward, so article links remain valid.
export default async () => {
  const snapshot = await readSnapshot()
  if (snapshot) await archiveSnapshot(snapshot)
}

export const config: Config = { schedule: '*/15 * * * *' }
