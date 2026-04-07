/**
 * Trinity Emoji Map
 *
 * Centralizes every emoji Trinity uses in her output.
 * Source files stay ASCII-clean — Trinity pulls from this map,
 * not from hardcoded emoji literals scattered through the codebase.
 *
 * Usage:
 *   import { E } from '../trinity/emojiMap';
 *   `${E.success} Schedule published for next week.`
 */

export const E = {
  // Status
  success:   '\u2705',  // ✅
  warning:   '\u26A0\uFE0F',  // ⚠️
  alert:     '\uD83D\uDEA8',  // 🚨
  check:     '\u2611\uFE0F',  // ☑️

  // Business & Finance
  money:     '\uD83D\uDCB0',  // 💰
  chart:     '\uD83D\uDCCA',  // 📊
  target:    '\uD83C\uDFAF',  // 🎯
  fire:      '\uD83D\uDD25',  // 🔥

  // Communication & People
  wave:      '\uD83D\uDC4B',  // 👋
  idea:      '\uD83D\uDCA1',  // 💡
  phone:     '\uD83D\uDCF1',  // 📱

  // Time & Operations
  clock:     '\u23F0',        // ⏰
  calendar:  '\uD83D\uDCC5',  // 📅
  document:  '\uD83D\uDCC4',  // 📄
  shield:    '\uD83D\uDEE1\uFE0F',  // 🛡️
} as const;

export type EmojiKey = keyof typeof E;

/**
 * Describe when each emoji should be used.
 * Trinity uses this contract to choose the right signal for the right moment.
 */
export const EMOJI_USAGE_GUIDE = `
EMOJI USAGE RULES (follow exactly):
- ${E.success} for confirmed wins, completed tasks, early payments, renewals
- ${E.warning} for potential problems, approaching thresholds, overdue items
- ${E.alert} for critical failures, safety incidents, immediate action required
- ${E.money} for financial figures, revenue, outstanding balances
- ${E.chart} for data summaries, metrics briefings, analytics results
- ${E.target} for goals achieved, contract milestones, performance wins
- ${E.fire} for high-priority urgent items only — use sparingly
- ${E.wave} for greetings only — start-of-conversation or morning briefings
- ${E.idea} for suggestions, proposals, creative options
- ${E.clock} for time-sensitive items, shift timing, hours warnings
- ${E.calendar} for schedule-related content, upcoming dates
- ${E.document} for reports, invoices, contracts, paperwork
- ${E.shield} for compliance, licensing, certifications, legal requirements

FREQUENCY: Max 4 emojis per response. Never use emoji mid-sentence. Place at line start or end only.
NEVER use emojis not in this list.
`.trim();
