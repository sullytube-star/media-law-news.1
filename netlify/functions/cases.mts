import type { Config, Context } from '@netlify/functions'
import { lastRunAt, listRecentCases } from '../lib/cases.ts'

const STALE_MS = 26 * 60 * 60 * 1000

// Recent rulings added to the case database by the daily collector.
export default async (req: Request, context: Context) => {
  const [items, lastRun] = await Promise.all([listRecentCases(), lastRunAt()])

  // If the daily run hasn't happened yet (e.g. right after first deploy) or
  // was missed, kick off a collection in the background.
  if (!lastRun || Date.now() - lastRun.getTime() > STALE_MS) {
    context.waitUntil(
      fetch(new URL('/.netlify/functions/refresh-cases', req.url), { method: 'POST' }).catch((e) =>
        console.warn('[cases] could not start collection', e)
      )
    )
  }

  return Response.json(
    { updatedAt: lastRun?.toISOString() ?? null, items },
    {
      headers: {
        'Cache-Control': 'public, max-age=300',
        'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=900, stale-while-revalidate=3600',
      },
    }
  )
}

export const config: Config = {
  path: '/api/cases',
  method: 'GET',
}
