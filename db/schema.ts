import { boolean, date, index, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

// Court rulings collected automatically from CourtListener each day.
// Every opinion the collector looks at gets a row (keyed by its CourtListener
// URL) so it is never processed twice; only rows with relevant = true are
// shown on the site.
export const cases = pgTable(
  'cases',
  {
    id: serial().primaryKey(),
    sourceUrl: text('source_url').notNull().unique(), // CourtListener opinion page
    pdfUrl: text('pdf_url'),
    title: text().notNull(),
    court: text().notNull(),
    dateFiled: date('date_filed').notNull(),
    relevant: boolean().notNull().default(false),
    category: text(), // first-amendment | media-law | entertainment | defamation-privacy
    citation: text(),
    holding: text(),
    impact: text(),
    issues: jsonb().$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('cases_relevant_date_idx').on(t.relevant, t.dateFiled)]
)

// One row per collector run, used to keep runs at least an hour apart.
export const caseRuns = pgTable('case_runs', {
  id: serial().primaryKey(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  examined: text().notNull().default(''), // short human-readable summary
})
