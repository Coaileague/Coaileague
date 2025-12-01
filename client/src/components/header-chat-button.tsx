/**
 * Header Chat Button - Mounted in top header
 * Clean, compact button that opens support chat
 */

import { useState } from 'react';
import { MessageCircle, X, Headset, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function HeaderChatButton() {
  const [showChat, setShowChat] = useState(false);
  const [inputValue, setInputValue] = useState('');

  // Hide on chat pages
  const currentPath = window.location.pathname;
  const shouldHide = currentPath.startsWith('/chat') || 
                     currentPath.startsWith('/org-chat') || 
                     currentPath.startsWith('/support/chatrooms');

  if (shouldHide) return null;

  const handleSend = () => {
    if (inputValue.trim()) {
      console.log('[HeaderChat] Message:', inputValue);
      setInputValue('');
    }
  };

  return (
    <>
      {/* Header Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setShowChat(!showChat)}
        className="h-7 w-7 relative hover-elevate active-elevate-2"
        data-testid="button-header-chat"
        title={showChat ? "Close support chat" : "Get help"}
      >
        <MessageCircle className="w-4 h-4" />
        <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" />
      </Button>

      {/* Chat Modal */}
      {showChat && (
        <div className="fixed top-14 left-1/2 transform -translate-x-1/2 z-50 w-[380px] max-w-[calc(100vw-16px)] animate-in fade-in slide-in-from-top-2">
          <div className="bg-card border rounded-lg shadow-2xl flex flex-col h-[500px]">
            {/* Header */}
            <div className="p-3 border-b bg-gradient-to-r from-blue-500/10 to-blue-500/10 flex justify-between items-center">
              <div className="flex-1">
                <h3 className="font-bold text-sm">Support Chat</h3>
                <p className="text-xs text-muted-foreground">Get help now</p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => setShowChat(false)}
                data-testid="button-close-header-chat"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                  <MessageCircle className="w-3 h-3 text-white" />
                </div>
                <div className="bg-muted rounded-lg px-3 py-2 text-sm">
                  <p>Hi there! How can we help you today?</p>
                </div>
              </div>
            </div>

            {/* Input */}
            <div className="p-3 border-t space-y-2">
              <Button
                onClick={() => window.location.href = '/chat'}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white"
                size="sm"
                data-testid="button-full-chat"
              >
                <Headset className="w-4 h-4 mr-2" />
                Request Help
              </Button>
              <div className="flex gap-2">
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="Message..."
                  className="text-sm h-8"
                  data-testid="input-header-chat"
                />
                <Button
                  onClick={handleSend}
                  disabled={!inputValue.trim()}
                  size="icon"
                  className="h-8 w-8"
                  data-testid="button-send-header-chat"
                >
                  <Send className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
