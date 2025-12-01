/**
 * Component that listens for chatroom notifications
 * Place this at the top level of your app to enable notifications globally
 */

import { useChatroomNotifications } from '@/hooks/useChatroomNotifications';

export function ChatroomNotificationListener() {
  useChatroomNotifications();
  return null; // This component doesn't render anything
}
