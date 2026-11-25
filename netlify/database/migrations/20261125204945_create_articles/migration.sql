CREATE TABLE "articles" (
	"id" serial PRIMARY KEY,
	"source_url" text NOT NULL UNIQUE,
	"year" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"source" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"topic" text NOT NULL,
	"categories" jsonb DEFAULT '[]' NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "articles_year_slug_idx" ON "articles" ("year","slug");--> statement-breakpoint
CREATE INDEX "articles_published_idx" ON "articles" ("published_at");