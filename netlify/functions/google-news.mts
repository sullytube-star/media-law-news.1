import type { Config, Context } from '@netlify/functions'
import { listDays, readDay, readLatest, refreshGoogleNews } from '../lib/google-news.ts'

// The scheduled pull runs once a day; if there's nothing saved yet (e.g. right
// after the first deploy) or the last pull missed a day, pull on demand.
const MAX_AGE_MS = 26 * 60 * 60 * 1000

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url)
  const date = url.searchParams.get('date')

  if (url.searchParams.has('days')) {
    return Response.json({ days: await listDays() }, { headers: { 'Cache-Control': 'public, max-age=300' } })
  }

  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Response.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
    }
    const day = await readDay(date)
    if (!day) return Response.json({ error: `No results saved for ${date}` }, { status: 404 })
    return Response.json(day, { headers: { 'Cache-Control': 'public, max-age=3600' } })
  }

  let snapshot = await readLatest().catch(() => null)
  const age = snapshot ? Date.now() - new Date(snapshot.updatedAt).getTime() : Infinity
  if (!snapshot || !(age < MAX_AGE_MS)) {
    try {
      snapshot = await refreshGoogleNews()
    } catch (error) {
      console.error('[google-news] on-demand pull failed', error)
      if (!snapshot) {
        return Response.json({ error: 'Google News results are unavailable right now' }, { status: 503 })
      }
    }
  }

  return Response.json(snapshot, {
    headers: {
      'Cache-Control': 'public, max-age=300',
      'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=900, stale-while-revalidate=3600',
    },
  })
}

export const config: Config = {
  path: '/api/google-news',
  method: 'GET',
}
