import { describe, it, expect } from 'vitest';

describe('Calloff Email Pipeline', () => {
  it('classifies calloff alias correctly', async () => {
    if (!process.env.DATABASE_URL) return;
    const { detectCategoryFromRecipient } = await import('../../server/services/trinity/trinityInboundEmailProcessor');
    expect(detectCategoryFromRecipient('calloffs@test.coaileague.com')).toBe('calloff');
    expect(detectCategoryFromRecipient('calloff@test.coaileague.com')).toBe('calloff');
  });

  it('does not misclassify unrelated aliases as calloff', async () => {
    if (!process.env.DATABASE_URL) return;
    const { detectCategoryFromRecipient } = await import('../../server/services/trinity/trinityInboundEmailProcessor');
    expect(detectCategoryFromRecipient('support@test.coaileague.com')).not.toBe('calloff');
  });
});
