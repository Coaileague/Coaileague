/**
 * TRINITY CHAT MODAL
 * ==================
 * Floating modal chat interface for Trinity AI.
 * - Opens as overlay without navigating away from current page
 * - Draggable on desktop for repositioning
 * - Full-screen on mobile for better UX
 * - Preserves page context so Trinity can advise on current view
 */

import { useState, useRef, useEffect, useCallback, createContext, useContext, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { isPublicRoute } from '@/config/trinity';
import {
  X,
  Send,
  Loader2,
  MessageCircle,
  Sparkles,
  GripHorizontal,
  Minimize2,
  Maximize2,
  Trash2,
} from 'lucide-react';
import { TrinityIconStatic } from '@/components/trinity-button';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface TrinityModalContextType {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  toggleModal: () => void;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  clearMessages: () => void;
}

const TrinityModalContext = createContext<TrinityModalContextType | null>(null);

export function useTrinityModal() {
  const context = useContext(TrinityModalContext);
  if (!context) {
    throw new Error('useTrinityModal must be used within TrinityModalProvider');
  }
  return context;
}

export function TrinityModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const { user, isLoading: authLoading } = useAuth();
  const [location] = useLocation();
  const prevUserRef = useRef<typeof user>(undefined);

  const openModal = useCallback(() => setIsOpen(true), []);
  const closeModal = useCallback(() => setIsOpen(false), []);
  const toggleModal = useCallback(() => setIsOpen(prev => !prev), []);
  const clearMessages = useCallback(() => setMessages([]), []);

  // Clear state on logout - detect when user becomes null
  useEffect(() => {
    if (prevUserRef.current && !user && !authLoading) {
      // User logged out - clear Trinity state
      setIsOpen(false);
      setMessages([]);
    }
    prevUserRef.current = user;
  }, [user, authLoading]);

  // Check if modal should render based on auth and route
  const shouldRenderModal = useMemo(() => {
    // Don't render modal for unauthenticated users
    if (!user) return false;
    // Don't render modal on public routes (landing, login, pricing, etc.)
    if (isPublicRoute(location)) return false;
    return true;
  }, [user, location]);

  return (
    <TrinityModalContext.Provider value={{ isOpen, openModal, closeModal, toggleModal, messages, setMessages, clearMessages }}>
      {children}
      {isOpen && shouldRenderModal && <TrinityModal onClose={closeModal} />}
    </TrinityModalContext.Provider>
  );
}

interface TrinityModalProps {
  onClose: () => void;
}

function TrinityModal({ onClose }: TrinityModalProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { messages, setMessages, clearMessages } = useTrinityModal();
  const [inputValue, setInputValue] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: window.innerWidth - 440, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setPosition(prev => ({
          x: Math.min(prev.x, window.innerWidth - 420),
          y: Math.min(prev.y, window.innerHeight - 500)
        }));
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!isMinimized) {
      inputRef.current?.focus();
    }
  }, [isMinimized]);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const pageContext = {
        currentPage: location,
        pageTitle: document.title,
        timestamp: new Date().toISOString(),
      };

      const response = await apiRequest('/api/trinity/chat', {
        method: 'POST',
        body: JSON.stringify({
          message,
          pageContext,
          conversationHistory: messages.slice(-10).map(m => ({
            role: m.role,
            content: m.content
          })),
        }),
      });
      return response;
    },
    onSuccess: (data: any) => {
      const assistantMessage: Message = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: data.response || data.message || 'I understand. How can I help you further?',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: 'Failed to get response from Trinity',
        variant: 'destructive',
      });
      const errorMessage: Message = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: 'I apologize, but I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    },
  });

  const handleSend = () => {
    if (!inputValue.trim() || chatMutation.isPending) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    chatMutation.mutate(inputValue.trim());
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isMobile) return;
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const newX = e.clientX - dragStart.current.x;
    const newY = e.clientY - dragStart.current.y;
    const maxX = window.innerWidth - 420;
    const maxY = window.innerHeight - 100;
    setPosition({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY))
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const clearChat = () => {
    clearMessages();
  };

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00BFFF] via-[#3b82f6] to-[#FFD700] flex items-center justify-center">
              <TrinityIconStatic size={24} />
            </div>
            <div>
              <h1 className="font-semibold">Trinity AI</h1>
              <p className="text-xs text-muted-foreground">Viewing: {location}</p>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            data-testid="button-close-trinity-modal"
          >
            <X className="h-5 w-5" />
          </Button>
        </header>

        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#00BFFF]/20 via-[#3b82f6]/20 to-[#FFD700]/20 flex items-center justify-center mb-4">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Ask Trinity Anything</h3>
              <p className="text-sm text-muted-foreground">
                I can see you're on <Badge variant="secondary">{location}</Badge>
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Ask me about this page, your data, or anything else!
              </p>
            </div>
          )}
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {chatMutation.isPending && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl px-4 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t bg-card shrink-0">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask Trinity..."
              disabled={chatMutation.isPending}
              className="flex-1"
              data-testid="input-trinity-message"
            />
            <Button
              onClick={handleSend}
              disabled={!inputValue.trim() || chatMutation.isPending}
              size="icon"
              data-testid="button-send-trinity-message"
            >
              {chatMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isMinimized) {
    return (
      <div
        className="fixed z-[100] rounded-full shadow-lg cursor-pointer"
        style={{
          left: position.x,
          top: position.y,
        }}
        onClick={() => setIsMinimized(false)}
        data-testid="trinity-modal-minimized"
      >
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#00BFFF] via-[#3b82f6] to-[#FFD700] flex items-center justify-center shadow-lg border border-blue-500/30">
          <TrinityIconStatic size={28} />
          {messages.length > 0 && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground rounded-full text-xs flex items-center justify-center">
              {messages.length}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-[99]"
        onClick={onClose}
        data-testid="trinity-modal-backdrop"
      />
      <Card
        className="fixed z-[100] w-[400px] shadow-2xl border-blue-500/20"
        style={{
          left: position.x,
          top: position.y,
          maxHeight: 'calc(100vh - 100px)',
        }}
        data-testid="trinity-modal-desktop"
      >
        <CardHeader
          className="flex flex-row items-center gap-3 py-3 px-4 border-b cursor-move select-none"
          onMouseDown={handleMouseDown}
        >
          <GripHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00BFFF] via-[#3b82f6] to-[#FFD700] flex items-center justify-center shrink-0">
            <TrinityIconStatic size={24} />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base">Trinity AI</CardTitle>
            <p className="text-xs text-muted-foreground truncate">
              Viewing: {location}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={clearChat}
              title="Clear chat"
              data-testid="button-clear-trinity-chat"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setIsMinimized(true)}
              title="Minimize"
              data-testid="button-minimize-trinity"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={onClose}
              title="Close"
              data-testid="button-close-trinity-modal"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <ScrollArea className="h-[350px] p-4" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#00BFFF]/20 via-[#3b82f6]/20 to-[#FFD700]/20 flex items-center justify-center mb-3">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-1">Ask Trinity Anything</h3>
                <p className="text-xs text-muted-foreground">
                  I can see this page and help you with it
                </p>
              </div>
            )}
            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-3 py-2 ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}
              {chatMutation.isPending && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-xl px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-3 border-t">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask Trinity..."
                disabled={chatMutation.isPending}
                className="flex-1"
                data-testid="input-trinity-message"
              />
              <Button
                onClick={handleSend}
                disabled={!inputValue.trim() || chatMutation.isPending}
                size="icon"
                data-testid="button-send-trinity-message"
              >
                {chatMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

export default TrinityModal;
