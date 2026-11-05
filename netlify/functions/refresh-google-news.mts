import type { Config } from '@netlify/functions'
import { refreshGoogleNews } from '../lib/google-news.ts'

// Pulls the day's Google News results (up to 100 stories across First
// Amendment, media law, entertainment law, defamation and privacy) once a day.
export default async () => {
  const snapshot = await refreshGoogleNews()
  console.log(
    `[google-news] saved ${snapshot.total} stories for ${snapshot.date}: ` +
      Object.entries(snapshot.counts).map(([t, n]) => `${t} ${n}`).join(', ') +
      (snapshot.errors.length ? `; ${snapshot.errors.length} searches failed` : '')
  )
}

// 11:00 UTC = 6 AM Eastern (7 AM during daylight saving time).
export const config: Config = {
  schedule: '0 11 * * *',
}
