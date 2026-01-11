/**
 * Header Chat Button - Simplified 1-on-1 HelpAI Support Chat
 * 
 * Flow:
 * 1. User clicks bug icon -> Chat opens with HelpAI greeting
 * 2. User describes issue -> HelpAI tries to help
 * 3. If unresolved -> Creates ticket, user waits
 * 4. Human support joins same chat -> 1-on-1 until resolved
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Bug, X, Send, Loader2, User, Bot, Headset, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { HELPAI, PLATFORM } from '@shared/platformConfig';

interface Message {
  id: string;
  sender: 'user' | 'helpai' | 'staff';
  senderName: string;
  content: string;
  timestamp: Date;
}

interface SessionState {
  id: string | null;
  status: 'idle' | 'ai_active' | 'waiting_human' | 'human_joined' | 'resolved';
  ticketNumber?: string;
  staffName?: string;
}

export function HeaderChatButton() {
  const [showChat, setShowChat] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [session, setSession] = useState<SessionState>({ id: null, status: 'idle' });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
  const shouldHide = currentPath.startsWith('/chat') || 
                     currentPath.startsWith('/org-chat') || 
                     currentPath.startsWith('/support/chatrooms') ||
                     currentPath.startsWith('/trinity');

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const startSession = async () => {
    try {
      setIsLoading(true);
      const res = await apiRequest('POST', '/api/support/chat/session', {
        url: window.location.href,
        userAgent: navigator.userAgent,
      });
      const data = await res.json();
      
      if (data.success && data.session) {
        setSession({
          id: data.session.id,
          status: data.session.status as SessionState['status'],
          ticketNumber: data.session.ticketNumber,
        });
        setMessages(data.session.messages.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        })));
      }
    } catch (error) {
      console.error('[SupportChat] Failed to start session:', error);
      setMessages([{
        id: 'error-1',
        sender: 'helpai',
        senderName: HELPAI.name,
        content: "I'm having trouble connecting. Please try again in a moment.",
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChat = async () => {
    setShowChat(true);
    if (!session.id) {
      await startSession();
    }
  };

  const handleCloseChat = () => {
    setShowChat(false);
  };

  const handleSend = async () => {
    if (!inputValue.trim() || !session.id || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      senderName: 'You',
      content: inputValue.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    const messageContent = inputValue.trim();
    setInputValue('');
    setIsLoading(true);

    try {
      const res = await apiRequest('POST', `/api/support/chat/session/${session.id}/message`, {
        content: messageContent,
      });
      const data = await res.json();

      if (data.success && data.message) {
        const responseMessage: Message = {
          id: data.message.id,
          sender: data.message.sender,
          senderName: data.message.senderName,
          content: data.message.content,
          timestamp: new Date(data.message.timestamp),
        };
        setMessages(prev => [...prev, responseMessage]);

        if (data.session) {
          setSession(prev => ({
            ...prev,
            status: data.session.status as SessionState['status'],
            ticketNumber: data.session.ticketNumber || prev.ticketNumber,
            staffName: data.session.staffName || prev.staffName,
          }));
        }
      }
    } catch (error) {
      console.error('[SupportChat] Failed to send message:', error);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        sender: 'helpai',
        senderName: HELPAI.name,
        content: "I had trouble processing that. Please try again.",
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestHuman = async () => {
    if (!session.id) return;
    setIsLoading(true);

    try {
      const res = await apiRequest('POST', `/api/support/chat/session/${session.id}/escalate`, {
        reason: 'User requested human support',
      });
      const data = await res.json();

      if (data.success && data.session) {
        setSession(prev => ({
          ...prev,
          status: 'waiting_human',
          ticketNumber: data.session.ticketNumber,
        }));

        if (data.session.messages) {
          const newMessages = data.session.messages.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          }));
          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            return [...prev, ...newMessages.filter((m: Message) => !existingIds.has(m.id))];
          });
        }
      }
    } catch (error) {
      console.error('[SupportChat] Failed to escalate:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const shouldPoll = (session.status === 'waiting_human' || session.status === 'human_joined') && session.id;
    
    if (shouldPoll) {
      const pollInterval = session.status === 'human_joined' ? 2000 : 5000;
      
      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/support/chat/session/${session.id}`);
          const data = await res.json();
          
          if (data.success && data.session) {
            if (data.session.messages) {
              setMessages(data.session.messages.map((m: any) => ({
                ...m,
                timestamp: new Date(m.timestamp),
              })));
            }
            
            if (data.session.status !== session.status) {
              setSession(prev => ({
                ...prev,
                status: data.session.status,
                staffName: data.session.staffName || prev.staffName,
              }));
            }
            
            if (data.session.status === 'resolved') {
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
            }
          }
        } catch (error) {
          console.error('[SupportChat] Poll error:', error);
        }
      }, pollInterval);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [session.status, session.id]);

  if (shouldHide) return null;

  const getStatusBadge = () => {
    switch (session.status) {
      case 'waiting_human':
        return (
          <Badge variant="outline" className="text-amber-500 border-amber-500 text-xs">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Waiting for support...
          </Badge>
        );
      case 'human_joined':
        return (
          <Badge variant="outline" className="text-green-500 border-green-500 text-xs">
            <CheckCircle className="w-3 h-3 mr-1" />
            {session.staffName || 'Support Agent'} joined
          </Badge>
        );
      case 'resolved':
        return (
          <Badge variant="outline" className="text-blue-500 border-blue-500 text-xs">
            <CheckCircle className="w-3 h-3 mr-1" />
            Resolved
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleOpenChat}
        className="h-7 w-7 relative hover-elevate active-elevate-2"
        data-testid="button-header-chat"
        title="Get support"
      >
        <Bug className="w-4 h-4" />
        {session.status === 'waiting_human' && (
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
        )}
        {session.status === 'human_joined' && (
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full" />
        )}
      </Button>

      {showChat && (
        <div className="fixed top-14 left-1/2 transform -translate-x-1/2 z-50 w-[400px] max-w-[calc(100vw-16px)] animate-in fade-in slide-in-from-top-2">
          <div className="bg-card border rounded-lg shadow-2xl flex flex-col h-[520px]">
            <div className="p-3 border-b bg-gradient-to-r from-violet-500/10 to-indigo-500/10 flex justify-between items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm">{PLATFORM.name} Support</h3>
                  {session.ticketNumber && (
                    <Badge variant="secondary" className="text-xs">
                      #{session.ticketNumber}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {getStatusBadge() || (
                    <p className="text-xs text-muted-foreground">Powered by {HELPAI.name}</p>
                  )}
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 flex-shrink-0"
                onClick={handleCloseChat}
                data-testid="button-close-header-chat"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1 p-3">
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={cn(
                      "flex gap-2",
                      msg.sender === 'user' && "flex-row-reverse"
                    )}
                  >
                    <div className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0",
                      msg.sender === 'user' && "bg-primary/20",
                      msg.sender === 'helpai' && "bg-gradient-to-r from-violet-600 to-indigo-600",
                      msg.sender === 'staff' && "bg-gradient-to-r from-green-600 to-emerald-600"
                    )}>
                      {msg.sender === 'user' && <User className="w-4 h-4 text-primary" />}
                      {msg.sender === 'helpai' && <Bot className="w-4 h-4 text-white" />}
                      {msg.sender === 'staff' && <Headset className="w-4 h-4 text-white" />}
                    </div>
                    <div className={cn(
                      "rounded-lg px-3 py-2 text-sm max-w-[280px]",
                      msg.sender === 'user' && "bg-primary text-primary-foreground",
                      msg.sender === 'helpai' && "bg-muted",
                      msg.sender === 'staff' && "bg-green-500/10 border border-green-500/20"
                    )}>
                      {msg.sender !== 'user' && (
                        <p className="text-xs font-medium mb-1 opacity-70">{msg.senderName}</p>
                      )}
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    </div>
                    <div className="bg-muted rounded-lg px-3 py-2 text-sm">
                      <span className="text-muted-foreground">Thinking...</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="p-3 border-t space-y-2">
              {session.status === 'ai_active' && (
                <Button
                  onClick={handleRequestHuman}
                  variant="outline"
                  className="w-full text-xs"
                  size="sm"
                  disabled={isLoading}
                  data-testid="button-request-human"
                >
                  <Headset className="w-3 h-3 mr-2" />
                  Talk to a Human
                </Button>
              )}
              
              <div className="flex gap-2">
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder={session.status === 'waiting_human' ? "Support will join soon..." : "Type your message..."}
                  className="text-sm h-9"
                  disabled={isLoading || session.status === 'resolved'}
                  data-testid="input-header-chat"
                />
                <Button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isLoading || session.status === 'resolved'}
                  size="icon"
                  className="h-9 w-9"
                  data-testid="button-send-header-chat"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
