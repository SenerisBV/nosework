// Hard guard: tests must never reach a real database.
// getClient() throws when ANALYTICS_DATABASE_URL is unset, so removing it here
// turns any accidental DB access in a unit test into a loud failure rather
// than a silent write to the developer's live analytics data.
delete process.env.ANALYTICS_DATABASE_URL;
delete process.env.DATABASE_URL;
