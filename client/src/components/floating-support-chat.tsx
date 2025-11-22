/**
 * FloatingSupportChat - Enhanced Draggable Chat Launcher
 * 
 * Features:
 * - Draggable with Pointer Events API (desktop + mobile touch)
 * - Minimizable to compact pill
 * - Shows real IDs (workId, orgId, orgName)
 * - Role-based routing:
 *   - Support roles → /support/chatrooms dashboard
 *   - Regular users → /org-chat hub
 *   - Guests → AI support flow
 * - Position persistence via localStorage
 * - Viewport bounds clamping
 */

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, X, MessageCircle, Minimize2, Maximize2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { useEmployee } from '@/hooks/useEmployee';
import { cn } from '@/lib/utils';

interface ChatBubbleState {
  position: { x: number; y: number };
  isMinimized: boolean;
  isOpen: boolean;
}

interface Message {
  id: number;
  type: 'bot' | 'user';
  text: string;
  timestamp: Date;
}

export function FloatingSupportChat() {
  const { user } = useAuth();
  const { employee } = useEmployee();
  const [location, setLocation] = useLocation();
  
  // Real IDs from auth system
  const workId = employee?.employeeNumber || 'GUEST';
  const orgId = employee?.workspaceId || 'N/A';
  const platformRole = (employee as any)?.platformRole || null;
  const workspaceRole = employee?.workspaceRole || null;
  
  // Hide on chat pages AND workspace pages to avoid conflicts (chat already in mobile nav)
  const shouldHide = location.startsWith('/chat') || 
                     location.startsWith('/org-chat') || 
                     location.startsWith('/support/chatrooms') ||
                     location === '/dashboard' ||
                     location === '/schedule' ||
                     location === '/billing' ||
                     location === '/invoices' ||
                     location === '/payroll' ||
                     location === '/employees' ||
                     location === '/clients' ||
                     location === '/time-tracking' ||
                     location === '/analytics' ||
                     location === '/reports' ||
                     location.startsWith('/employee/portal') ||
                     location.startsWith('/auditor/portal') ||
                     location.startsWith('/client/portal');
  
  // State management with localStorage persistence (browser-safe)
  const [state, setState] = useState<ChatBubbleState>({
    position: { x: 0, y: 0 },
    isMinimized: true,
    isOpen: false
  });
  
  // Hydrate from localStorage on mount (browser only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chat-bubble-state');
      if (saved) {
        try {
          setState(JSON.parse(saved));
        } catch {
          // Fallback: set position based on viewport
          setState({
            position: { 
              x: Math.max(0, window.innerWidth - 420), 
              y: Math.max(0, window.innerHeight - 620) 
            },
            isMinimized: true,
            isOpen: false
          });
        }
      } else {
        // First time: set position based on viewport
        setState({
          position: { 
            x: Math.max(0, window.innerWidth - 420), 
            y: Math.max(0, window.innerHeight - 620) 
          },
          isMinimized: true,
          isOpen: false
        });
      }
    }
  }, []);
  
  // AI chat state (for guest flow)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      type: 'bot',
      text: "Hi! I'm your AutoForce™ AI Support Assistant. How can I help you today?",
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Dragging state
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  
  // Save state to localStorage whenever it changes (browser only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('chat-bubble-state', JSON.stringify(state));
    }
  }, [state]);
  
  // Viewport bounds clamping on resize (browser only)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleResize = () => {
      const maxX = window.innerWidth - 400;
      const maxY = window.innerHeight - 600;
      setState(prev => ({
        ...prev,
        position: {
          x: Math.max(0, Math.min(prev.position.x, maxX)),
          y: Math.max(0, Math.min(prev.position.y, maxY))
        }
      }));
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Pointer Events drag handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, textarea')) {
      return; // Don't drag when interacting with controls
    }
    
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX - state.position.x,
      y: e.clientY - state.position.y
    };
    
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || typeof window === 'undefined') return;
    
    const newX = Math.max(0, Math.min(e.clientX - dragStartRef.current.x, window.innerWidth - 400));
    const newY = Math.max(0, Math.min(e.clientY - dragStartRef.current.y, window.innerHeight - 100));
    
    setState(prev => ({
      ...prev,
      position: { x: newX, y: newY }
    }));
  };
  
  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };
  
  // Smart routing handler (role-based)
  const handleChatClick = () => {
    if (!user) {
      // Guest: Open FloatingSupportChat AI flow
      setState(prev => ({ ...prev, isOpen: true, isMinimized: false }));
    } else {
      // Authenticated users: Open chat bubble (support staff and regular users can access their respective dashboards via header navigation)
      setState(prev => ({ ...prev, isOpen: true, isMinimized: false }));
    }
  };
  
  // Navigation to dashboards (separate from chat bubble open)
  const handleNavigateToDashboard = () => {
    if (platformRole === 'root_admin' || platformRole === 'support' || 
        platformRole === 'support_manager' || platformRole === 'support_agent') {
      setLocation('/support/chatrooms');
    } else {
      setLocation('/org-chat');
    }
  };
  
  // Send message to HelpOS AI
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
      const response = await fetch('/api/support/helpos-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          message: query,
          conversationHistory: messages.slice(-5).map(m => ({
            role: m.type === 'user' ? 'user' : 'assistant',
            content: m.text
          }))
        })
      });
      
      if (!response.ok) throw new Error('HelpOS API Error');
      
      const data = await response.json();
      setIsTyping(false);
      
      const botMessage: Message = {
        id: messages.length + 2,
        type: 'bot',
        text: data.message || data.response || "No response from AI",
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, botMessage]);
      
      // Handle escalation
      if (data.escalated) {
        if (user) {
          sessionStorage.setItem('helpos_escalation', JSON.stringify({
            conversationId: data.conversationId,
            ticketNumber: data.ticketNumber
          }));
          setLocation(`/chat/${data.conversationId}`);
        } else {
          // Guest escalation flow would go here
          alert('Please log in to connect with a live support agent.');
        }
      }
    } catch (error) {
      console.error('[AI Support] Error:', error);
      setIsTyping(false);
      const errorMessage: Message = {
        id: messages.length + 2,
        type: 'bot',
        text: "I'm having trouble connecting right now. Please try again or contact support directly.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  if (shouldHide) return null;
  
  // Minimized pill UI
  if (state.isMinimized) {
    return (
      <div
        style={{
          position: 'fixed',
          left: state.position.x,
          top: state.position.y,
          zIndex: 9999,
          touchAction: 'none'
        }}
        className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-full px-4 py-3 shadow-2xl cursor-pointer hover-elevate active-elevate-2"
        onClick={() => setState(prev => ({ ...prev, isMinimized: false }))}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        data-testid="chat-bubble-minimized"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="font-medium text-sm">Live Chat</span>
      </div>
    );
  }
  
  // Floating button (when closed)
  if (!state.isOpen) {
    return (
      <button
        onClick={handleChatClick}
        className="fixed bottom-20 sm:bottom-6 right-6 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-full p-4 shadow-2xl hover:shadow-blue-500/50 hover:scale-110 transition-all duration-300 z-[9999] group"
        data-testid="button-open-chat"
      >
        <MessageCircle className="w-6 h-6" />
        <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold opacity-0 group-hover:opacity-100 transition-opacity">
          !
        </div>
      </button>
    );
  }
  
  // Full chat window (guest AI flow)
  return (
    <div
      style={{
        position: 'fixed',
        left: state.position.x,
        top: state.position.y,
        zIndex: 9999,
        width: '400px',
        maxHeight: '600px',
        touchAction: 'none'
      }}
      className="bg-card border-2 border-border rounded-lg shadow-2xl flex flex-col"
      data-testid="chat-bubble-window"
    >
      {/* Draggable header */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="p-3 border-b cursor-move bg-gradient-to-r from-blue-500/10 to-blue-500/10 rounded-t-lg"
        data-testid="chat-bubble-header"
      >
        <div className="flex justify-between items-center">
          <div className="flex-1">
            <h3 className="font-bold text-sm">Live Chat - AI Support</h3>
            <p className="text-xs text-muted-foreground">
              {workId} • {orgId}
            </p>
          </div>
          <div className="flex gap-1">
            {user && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNavigateToDashboard();
                }}
                title={platformRole && ['root_admin', 'support', 'support_manager', 'support_agent'].includes(platformRole) ? "Go to Support Dashboard" : "Go to Team Chat"}
                data-testid="button-navigate-dashboard"
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                setState(prev => ({ ...prev, isMinimized: true }));
              }}
              data-testid="button-minimize-chat"
            >
              <Minimize2 className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                setState(prev => ({ ...prev, isOpen: false }));
              }}
              data-testid="button-close-chat"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[400px] max-h-[450px]">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex gap-2",
              msg.type === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            {msg.type === 'bot' && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-600 to-blue-500 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}
            <div
              className={cn(
                "rounded-lg px-3 py-2 max-w-[80%]",
                msg.type === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              )}
            >
              <p className="text-sm">{msg.text}</p>
            </div>
            {msg.type === 'user' && (
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}
        {isTyping && (
          <div className="flex gap-2 justify-start">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-600 to-blue-500 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-muted rounded-lg px-3 py-2">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input area */}
      <div className="p-3 border-t">
        <div className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Type your message..."
            className="flex-1"
            data-testid="input-chat-message"
          />
          <Button
            onClick={handleSend}
            disabled={!inputValue.trim() || isTyping}
            size="icon"
            data-testid="button-send-message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
