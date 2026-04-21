/**
 * Unit test setup — runs before each unit test file.
 * Sets DATABASE_URL to a sentinel value so server/db.ts can be imported
 * without throwing, even though no real DB connection is made.
 * Unit tests mock the db module themselves (see installInsertCapture in
 * trinity-workflows-17c.test.ts) and never touch Postgres.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit-test-sentinel/noop';
