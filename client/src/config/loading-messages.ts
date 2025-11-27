/**
 * Humorous loading messages for the welcome notification
 * These are displayed while the system initializes
 */

export const LOADING_MESSAGES = [
  "Waking up the AI brain... ☕",
  "Teaching robots to work efficiently... 🤖",
  "Polishing the workspace... ✨",
  "Organizing the schedule books... 📚",
  "Preparing your dashboard... 📊",
  "Loading your superpowers... ⚡",
  "Synchronizing timelines... ⏰",
  "Calibrating the payroll system... 💰",
  "Summoning the autonomous scheduler... 🧠",
  "Generating productivity reports... 📈",
  "Warming up the database... 🔥",
  "Activating workforce intelligence... 🎯",
  "Assembling your CoAIleague team... 👥",
  "Energizing the platform... ⚙️",
  "Loading your workforce magic... ✨",
  "Preparing autonomous workflows... 🚀",
  "Calibrating the predictive engine... 🔮",
  "Initializing smart scheduling... 📅",
];

/**
 * Get a random loading message
 */
export function getRandomLoadingMessage(): string {
  return LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
}
