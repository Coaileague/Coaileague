/**
 * Responsive Chat Layout Wrapper
 * Automatically switches between desktop and mobile layouts
 */

import { useDeviceDetection } from "@/hooks/use-device-detection";
import { DesktopChatLayout } from "./desktop-chat-layout";
import { MobileChatLayout } from "./mobile-chat-layout";
import type { ChatMessage } from "@shared/schema";

interface User {
  id: string;
  name: string;
  role: 'staff' | 'customer' | 'guest';
  platformRole?: string;
  isTyping?: boolean;
}

interface ResponsiveChatLayoutProps {
  messages: ChatMessage[];
  users: User[];
  currentUser: { id: string; name: string; isStaff: boolean };
  onSendMessage: (message: string) => void;
  onCommandExecute: (command: string) => void;
}

export function ResponsiveChatLayout(props: ResponsiveChatLayoutProps) {
  const deviceType = useDeviceDetection();
  
  // Mobile and tablet use simplified layout
  // Desktop gets full IRC/MSN experience
  if (deviceType === 'desktop') {
    return <DesktopChatLayout {...props} />;
  }
  
  return <MobileChatLayout {...props} />;
}
