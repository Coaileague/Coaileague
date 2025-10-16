/**
 * HelpOS™ Queue Reminder Job
 * Runs every 5 minutes to send queue position reminders
 */

import { queueManager } from './helpOsQueue';
import { generateQueueReminder } from './aiBot';
import { storage } from '../storage';

const REMINDER_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function startQueueReminderJob(broadcastToConversation: (conversationId: string, message: any) => void) {
  console.log('Starting HelpOS™ queue reminder job (5-min intervals)');

  setInterval(async () => {
    try {
      // Get users who need reminders (5+ minutes since last announcement)
      const usersNeedingReminder = await queueManager.getUsersNeedingReminder();

      if (usersNeedingReminder.length === 0) {
        return; // No one needs reminder
      }

      console.log(`Sending queue reminders to ${usersNeedingReminder.length} user(s)`);

      // Update all queue positions first
      await queueManager.updateQueuePositions();

      for (const entry of usersNeedingReminder) {
        try {
          // Get updated entry with latest position
          const updatedEntry = await queueManager.getQueueEntry(entry.conversationId);
          if (!updatedEntry || updatedEntry.status !== 'waiting') {
            continue; // Skip if no longer waiting
          }

          // Generate reminder message
          const reminderMessage = await generateQueueReminder(
            entry.userName,
            updatedEntry.queuePosition || 1,
            updatedEntry.estimatedWaitMinutes || 5
          );

          // Save message to database
          const message = await storage.createChatMessage({
            conversationId: entry.conversationId,
            senderId: 'ai-bot',
            senderName: 'HelpOS™',
            senderType: 'bot',
            message: reminderMessage,
            messageType: 'text',
          });

          // Mark announcement sent
          await queueManager.markAnnouncementSent(entry.id);

          // Broadcast to conversation
          broadcastToConversation(entry.conversationId, {
            type: 'new_message',
            message,
          });

        } catch (userError) {
          console.error(`Failed to send reminder to ${entry.userName}:`, userError);
        }
      }
    } catch (error) {
      console.error('Queue reminder job error:', error);
    }
  }, REMINDER_INTERVAL_MS);
}
