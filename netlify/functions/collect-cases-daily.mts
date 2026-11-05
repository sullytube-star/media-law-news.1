import type { Config } from '@netlify/functions'

// Scheduled functions are limited to 30 seconds, so this just starts the
// background collector, which does the actual reading.
// 12:00 UTC = 7 AM Eastern (8 AM during daylight saving time).
export default async () => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL
  const res = await fetch(`${base}/.netlify/functions/refresh-cases`, { method: 'POST' })
  console.log(`[cases] started daily collection: HTTP ${res.status}`)
}

export const config: Config = {
  schedule: '0 12 * * *',
}
