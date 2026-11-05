import type { Config } from '@netlify/functions'
import { collectCases } from '../lib/cases.ts'

// Reads new rulings and adds the relevant ones to the case database. Runs as a
// background function (up to 15 minutes) because each opinion is downloaded
// and read in full. Triggered daily by collect-cases-daily, and on demand by
// /api/cases when the last run is more than a day old. Runs are at least an
// hour apart, so extra triggers are harmless.
export default async () => {
  try {
    const result = await collectCases()
    console.log('[cases]', JSON.stringify({ ...result, errors: result.errors.slice(0, 10) }))
  } catch (error) {
    console.error('[cases] collection failed', error)
  }
}

export const config: Config = {
  background: true,
}
