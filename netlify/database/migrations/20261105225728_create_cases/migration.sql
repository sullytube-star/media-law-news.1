CREATE TABLE "case_runs" (
	"id" serial PRIMARY KEY,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"examined" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" serial PRIMARY KEY,
	"source_url" text NOT NULL UNIQUE,
	"pdf_url" text,
	"title" text NOT NULL,
	"court" text NOT NULL,
	"date_filed" date NOT NULL,
	"relevant" boolean DEFAULT false NOT NULL,
	"category" text,
	"citation" text,
	"holding" text,
	"impact" text,
	"issues" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cases_relevant_date_idx" ON "cases" ("relevant","date_filed");