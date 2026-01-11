/**
 * Component that listens for chatroom notifications
 * Place this at the top level of your app to enable notifications globally
 * 
 * CRITICAL: This component must NOT render on HelpDesk pages to avoid
 * competing WebSocket connections that cause infinite loops
 */

import { useState, useEffect } from 'react';
import { useChatroomNotifications } from '@/hooks/useChatroomNotifications';

function ChatroomNotificationListenerInner() {
  useChatroomNotifications();
  return null;
}

export function ChatroomNotificationListener() {
  // Use state to track if we should render, initialized from window.location
  // This avoids useLocation which can cause update loops
  const [shouldRender, setShouldRender] = useState(() => {
    const path = window.location.pathname;
    return !path.startsWith('/helpdesk') && 
           !path.startsWith('/chat') &&
           !path.startsWith('/chatrooms');
  });
  
  // Update on popstate (browser navigation)
  useEffect(() => {
    const checkPath = () => {
      const path = window.location.pathname;
      const shouldShow = !path.startsWith('/helpdesk') && 
                         !path.startsWith('/chat') &&
                         !path.startsWith('/chatrooms');
      setShouldRender(shouldShow);
    };
    
    window.addEventListener('popstate', checkPath);
    return () => window.removeEventListener('popstate', checkPath);
  }, []);
  
  // Don't render the inner component on chat pages at all
  if (!shouldRender) {
    return null;
  }
  
  return <ChatroomNotificationListenerInner />;
}
