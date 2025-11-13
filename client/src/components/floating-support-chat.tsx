import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, X, MessageCircle, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLocation } from 'wouter';

interface Message {
  id: number;
  type: 'bot' | 'user';
  text: string;
  timestamp: Date;
  isEscalation?: boolean;
}

interface QuickAction {
  icon: string;
  text: string;
  value: string;
}

export function FloatingSupportChat() {
  const [, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      type: 'bot',
      text: "👋 Hi! I'm HelpOS™, your AutoForce™ Support Assistant. I'm here to help you resolve issues quickly. What can I help you with today?",
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!isOpen && messages.length > 1) {
      setUnreadCount(prev => prev + 1);
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
    }
  }, [isOpen]);

  const quickActions: QuickAction[] = [
    { icon: "🔐", text: "Login Help", value: "I can't log in to my account" },
    { icon: "📅", text: "Schedule Help", value: "How do I view my schedule?" },
    { icon: "⏰", text: "Time Tracking", value: "Help with clock in/out" },
    { icon: "👤", text: "Talk to Human", value: "I need to speak with a live support agent" }
  ];

  const handleSend = async () => {
    if (inputValue.trim() === '') return;

    const userMessage: Message = {
      id: messages.length + 1,
      type: 'user',
      text: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const query = inputValue;
    setInputValue('');
    setIsTyping(true);

    try {
      // Build conversation history for context
      const conversationHistory = messages
        .filter(m => m.type !== 'bot' || !m.isEscalation)
        .map(m => ({
          role: m.type === 'user' ? 'user' : 'assistant',
          content: m.text
        }));

      console.log('[HelpOS] Sending request:', { 
        message: query, 
        sessionId, 
        historyLength: conversationHistory.length,
        isEscalationRequest: /talk to (a )?human|speak to agent|escalate|transfer|live support/i.test(query)
      });

      const response = await fetch('/api/support/helpos-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          message: query,
          sessionId: sessionId,
          conversationHistory: conversationHistory.slice(-5) // Last 5 messages for context
        })
      });

      console.log('[HelpOS] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[HelpOS] Error response body:', errorText);
        throw new Error(`HelpOS API Error: ${response.status} - ${errorText.substring(0, 100)}`);
      }

      const data = await response.json();
      console.log('[HelpOS] Success response:', {
        ...data,
        hasEscalated: !!data.escalated,
        hasConversationId: !!data.conversationId,
        hasTicketNumber: !!data.ticketNumber
      });
      
      // Store sessionId for conversation continuity
      if (data.sessionId && !sessionId) {
        console.log('[HelpOS] Setting sessionId:', data.sessionId);
        setSessionId(data.sessionId);
      }
      
      setIsTyping(false);

      // Handle escalation to live helpdesk - keep user in HelpOS chat
      if (data.escalated && data.conversationId) {
        console.log('[HelpOS] ✅ ESCALATION TRIGGERED:', {
          conversationId: data.conversationId,
          ticketNumber: data.ticketNumber,
          escalationReason: data.escalationReason
        });
        const escalationMessage: Message = {
          id: messages.length + 2,
          type: 'bot',
          text: `${data.message}\n\n🎫 Ticket #${data.ticketNumber} created. Our support team has been notified and will respond shortly.\n\nYou can continue chatting here or [click here to view in full chat →](/chat/${data.conversationId})`,
          timestamp: new Date(),
          isEscalation: true
        };
        setMessages(prev => [...prev, escalationMessage]);
        // Stay in HelpOS mini chat - user can manually navigate to live chat if desired
        return;
      }

      const botMessage: Message = {
        id: messages.length + 2,
        type: 'bot',
        text: data.message,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error: any) {
      console.error('[HelpOS] FULL ERROR:', error);
      console.error('[HelpOS] Error type:', typeof error);
      console.error('[HelpOS] Error keys:', Object.keys(error));
      console.error('[HelpOS] Error message:', error?.message);
      console.error('[HelpOS] Error stack:', error?.stack);
      
      setIsTyping(false);
      
      const errorDetails = error?.message 
        ? error.message 
        : error?.toString 
        ? error.toString() 
        : 'Unknown error - check browser console for details';
      
      const errorMessage: Message = {
        id: messages.length + 2,
        type: 'bot',
        text: `I apologize, but I'm having trouble connecting right now. Please try again or contact our support team directly.\n\n🔍 Debug Info: ${errorDetails}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickAction = (value: string) => {
    setInputValue(value);
  };

  return (
    <>
      {/* Chat Bubble Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 bg-gradient-to-r from-blue-500 to-cyan-400 text-white rounded-full p-4 shadow-2xl hover:shadow-blue-500/50 hover:scale-110 transition-all duration-300 z-[15000] group"
          aria-label="Open support chat"
          data-testid="button-open-support-chat"
        >
          <MessageCircle className="w-7 h-7" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center animate-pulse">
              {unreadCount}
            </span>
          )}
          <span className="absolute right-full mr-3 bg-gray-900 dark:bg-gray-800 text-white px-3 py-2 rounded-lg text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">
            Need help? Chat with us!
          </span>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div 
          className={cn(
            "fixed bg-background dark:bg-card shadow-2xl z-[15000] flex flex-col transition-all duration-300 border border-border",
            isMinimized ? 'h-16 w-80' : 'h-[600px] w-96',
            "max-sm:inset-4 max-sm:w-auto max-sm:h-auto max-sm:rounded-2xl",
            "sm:bottom-6 sm:right-6 sm:w-96 sm:h-[600px] sm:rounded-2xl"
          )}
          data-testid="support-chat-window"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-500 to-cyan-400 text-white px-3 py-2.5 sm:px-4 sm:py-3 rounded-t-2xl flex items-center justify-between shadow-md">
            <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
              <div className="bg-white rounded-full p-1 sm:p-1.5 flex-shrink-0">
                <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-xs sm:text-sm truncate">
                  HelpOS<span className="text-[0.5rem] sm:text-[0.6rem] align-super">™</span> <span className="text-[10px] sm:text-xs font-normal">(Bot)</span>
                </h2>
                <p className="text-[10px] sm:text-xs text-blue-50 truncate">AutoForce™ Support</p>
                <div className="flex items-center space-x-1 sm:space-x-1.5 mt-0.5">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-[10px] sm:text-xs text-blue-50">Online</span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="hover:bg-blue-600 p-1.5 rounded-lg transition-colors"
                aria-label="Minimize chat"
                data-testid="button-minimize-chat"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="hover:bg-blue-600 p-1.5 rounded-lg transition-colors"
                aria-label="Close chat"
                data-testid="button-close-chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Messages Container */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-muted/30">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={cn(
                      "flex items-start space-x-1.5 sm:space-x-2 max-w-[85%]",
                      message.type === 'user' && 'flex-row-reverse space-x-reverse'
                    )}>
                      <div className={cn(
                        "flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center",
                        message.type === 'user' 
                          ? 'bg-blue-500' 
                          : 'bg-gradient-to-br from-blue-500 to-cyan-400'
                      )}>
                        {message.type === 'user' ? (
                          <User className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                        ) : (
                          <Bot className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                        )}
                      </div>
                      <div className={cn(
                        "px-3 py-2",
                        message.type === 'user' 
                          ? 'bg-blue-500 text-white rounded-2xl rounded-tr-sm' 
                          : 'bg-blue-500/10 rounded-2xl rounded-tl-sm'
                      )}>
                        <p className="whitespace-pre-line text-sm leading-relaxed">{message.text}</p>
                        <span className={cn(
                          "text-xs mt-1 block",
                          message.type === 'user' ? 'text-blue-100' : 'text-muted-foreground'
                        )}>
                          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div className="flex justify-start">
                    <div className="flex items-start space-x-1.5 sm:space-x-2">
                      <div className="flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
                        <Bot className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                      </div>
                      <div className="bg-blue-500/10 rounded-2xl rounded-tl-sm px-3 py-2 sm:px-4 sm:py-3">
                        <div className="flex space-x-1.5">
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Actions - Horizontal scroll on mobile, grid on desktop */}
              {messages.length === 1 && (
                <div className="px-4 pb-3 bg-muted/30 border-b border-border">
                  <p className="text-xs text-muted-foreground mb-2 font-medium">Quick Actions:</p>
                  {/* Mobile: Horizontal scrollable */}
                  <div className="flex sm:hidden gap-2 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory scrollbar-hide">
                    {quickActions.map((action, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickAction(action.value)}
                        className="flex-shrink-0 h-auto py-2 px-3 snap-start min-w-[140px]"
                        data-testid={`button-quick-action-${index}`}
                      >
                        <span className="text-lg mr-2">{action.icon}</span>
                        <span className="text-xs font-medium whitespace-nowrap">{action.text}</span>
                      </Button>
                    ))}
                  </div>
                  {/* Desktop: Grid layout */}
                  <div className="hidden sm:grid grid-cols-2 gap-2">
                    {quickActions.map((action, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickAction(action.value)}
                        className="justify-start h-auto py-2 px-3 text-left"
                        data-testid={`button-quick-action-${index}`}
                      >
                        <span className="text-lg mr-2">{action.icon}</span>
                        <span className="text-xs font-medium">{action.text}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input Area */}
              <div className="bg-background dark:bg-card border-t border-border px-4 py-3 rounded-b-2xl">
                <div className="flex items-end space-x-2">
                  <Input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type your message..."
                    className="flex-1 rounded-full"
                    data-testid="input-chat-message"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={inputValue.trim() === ''}
                    size="icon"
                    className="rounded-full bg-blue-500 hover:bg-blue-600 text-white flex-shrink-0"
                    data-testid="button-send-message"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Powered by AI • Typically replies in seconds
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
