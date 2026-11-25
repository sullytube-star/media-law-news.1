import { boolean, date, index, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

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

// Permanent article pages (/articles/YYYY/slug.html) for every story shown on
// the site. A row is created the first time a story is seen and its year/slug
// are never changed afterwards, so published URLs stay stable even if the
// publisher later edits the headline or the story drops out of its RSS feed.
export const articles = pgTable(
  'articles',
  {
    id: serial().primaryKey(),
    sourceUrl: text('source_url').notNull().unique(), // the original story
    year: text().notNull(),
    slug: text().notNull(),
    title: text().notNull(),
    source: text().notNull(),
    summary: text().notNull().default(''),
    topic: text().notNull(), // first-amendment | media-law | entertainment | defamation-privacy
    categories: jsonb().$type<string[]>().notNull().default([]),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('articles_year_slug_idx').on(t.year, t.slug),
    index('articles_published_idx').on(t.publishedAt),
  ]
)
