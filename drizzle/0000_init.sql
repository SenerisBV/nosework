CREATE TABLE "analytics_errors" (
	"id" text PRIMARY KEY NOT NULL,
	"siteId" text NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"fingerprint" text NOT NULL,
	"url" text NOT NULL,
	"pathname" text NOT NULL,
	"visitorHash" text,
	"sessionId" text,
	"userId" text,
	"browser" text,
	"browserVer" text,
	"os" text,
	"device" text,
	"metadata" json,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_salts" (
	"date" date PRIMARY KEY NOT NULL,
	"salt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"siteId" text NOT NULL,
	"fingerprint" text NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"count" integer DEFAULT 1 NOT NULL,
	"lastSeen" timestamp NOT NULL,
	"firstSeen" timestamp NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	CONSTRAINT "error_groups_site_fingerprint_unique" UNIQUE("siteId","fingerprint")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"siteId" text NOT NULL,
	"name" text NOT NULL,
	"properties" json,
	"visitorHash" text NOT NULL,
	"sessionId" text NOT NULL,
	"userId" text,
	"url" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_views" (
	"id" text PRIMARY KEY NOT NULL,
	"siteId" text NOT NULL,
	"url" text NOT NULL,
	"pathname" text NOT NULL,
	"referrer" text,
	"visitorHash" text NOT NULL,
	"sessionId" text NOT NULL,
	"country" text,
	"countryCode" text,
	"region" text,
	"city" text,
	"browser" text,
	"browserVer" text,
	"os" text,
	"osVer" text,
	"device" text,
	"userId" text,
	"isBot" boolean DEFAULT false NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "errors_site_timestamp_idx" ON "analytics_errors" USING btree ("siteId","timestamp");--> statement-breakpoint
CREATE INDEX "errors_site_fingerprint_idx" ON "analytics_errors" USING btree ("siteId","fingerprint");--> statement-breakpoint
CREATE INDEX "errors_user_idx" ON "analytics_errors" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "error_groups_site_status_lastseen_idx" ON "error_groups" USING btree ("siteId","status","lastSeen");--> statement-breakpoint
CREATE INDEX "events_site_name_timestamp_idx" ON "events" USING btree ("siteId","name","timestamp");--> statement-breakpoint
CREATE INDEX "events_site_timestamp_idx" ON "events" USING btree ("siteId","timestamp");--> statement-breakpoint
CREATE INDEX "events_user_idx" ON "events" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "page_views_site_timestamp_idx" ON "page_views" USING btree ("siteId","timestamp");--> statement-breakpoint
CREATE INDEX "page_views_site_pathname_idx" ON "page_views" USING btree ("siteId","pathname");--> statement-breakpoint
CREATE INDEX "page_views_session_idx" ON "page_views" USING btree ("sessionId");--> statement-breakpoint
CREATE INDEX "page_views_user_idx" ON "page_views" USING btree ("userId");