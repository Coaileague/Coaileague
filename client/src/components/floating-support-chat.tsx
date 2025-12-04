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
import { Send, Bot, User, X, MessageCircle, Minimize2, Maximize2, ExternalLink, Headset, Search, Brain, LineChart, Code2, Loader2 } from 'lucide-react';
import { useAIActivity, type AIActivityState } from '@/hooks/use-ai-activity';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { useEmployee } from '@/hooks/useEmployee';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { CHAT_BUBBLE_CONFIG } from '@/config/chatBubble';

interface ChatBubbleState {
  position: { x: number; y: number };
  isMinimized: boolean;
  isOpen: boolean;
}

type AnimationState = 'idle' | 'opening' | 'closing' | 'minimizing' | 'expanding';

interface Message {
  id: number;
  type: 'bot' | 'user';
  text: string;
  timestamp: Date;
}

const AI_STATE_CONFIG: Record<AIActivityState, { label: string; icon: JSX.Element; color: string }> = {
  IDLE: { label: 'Ready', icon: <Bot className="w-3 h-3" />, color: 'text-muted-foreground' },
  SEARCHING: { label: 'Searching knowledge base...', icon: <Search className="w-3 h-3" />, color: 'text-blue-500' },
  THINKING: { label: 'Thinking...', icon: <Brain className="w-3 h-3" />, color: 'text-purple-500' },
  ANALYZING: { label: 'Analyzing your request...', icon: <LineChart className="w-3 h-3" />, color: 'text-amber-500' },
  CODING: { label: 'Processing automation...', icon: <Code2 className="w-3 h-3" />, color: 'text-green-500' },
  UPLOADING: { label: 'Uploading data...', icon: <Loader2 className="w-3 h-3 animate-spin" />, color: 'text-cyan-500' },
  LISTENING: { label: 'Listening...', icon: <Bot className="w-3 h-3" />, color: 'text-indigo-500' },
  SUCCESS: { label: 'Complete!', icon: <Bot className="w-3 h-3" />, color: 'text-green-600' },
  ERROR: { label: 'Something went wrong', icon: <Bot className="w-3 h-3" />, color: 'text-red-500' },
  ADVISING: { label: 'Preparing response...', icon: <Brain className="w-3 h-3" />, color: 'text-violet-500' },
};

export function FloatingSupportChat() {
  const { user } = useAuth();
  const { employee } = useEmployee();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const [animationState, setAnimationState] = useState<AnimationState>('idle');
  
  const { activityState, isActive: isAIActive, lastEvent } = useAIActivity({
    workspaceId: employee?.workspaceId,
  });
  
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
  
  // Calculate initial position based on screen size (mobile vs desktop)
  const getInitialPosition = () => {
    const isMobileScreen = window.innerWidth < 640;
    const config = CHAT_BUBBLE_CONFIG.positioning;
    
    if (isMobileScreen) {
      // Mobile: position at bottom-right, well below header
      return {
        x: Math.max(0, window.innerWidth - config.mobileInitialOffsetX - CHAT_BUBBLE_CONFIG.elementWidths.minimizedPill),
        y: Math.max(config.topBoundary, window.innerHeight - config.mobileInitialOffsetY)
      };
    } else {
      // Desktop: original positioning
      return {
        x: Math.max(0, window.innerWidth - config.initialOffsetX),
        y: Math.max(config.topBoundary, window.innerHeight - config.initialOffsetY)
      };
    }
  };

  // Hydrate from localStorage on mount (browser only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chat-bubble-state');
      const topBoundary = CHAT_BUBBLE_CONFIG.positioning.topBoundary;
      
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Enforce top boundary to prevent header overlap
          setState({
            ...parsed,
            position: {
              x: Math.max(0, parsed.position.x),
              y: Math.max(topBoundary, parsed.position.y)
            }
          });
        } catch {
          // Fallback: set position based on viewport
          setState({
            position: getInitialPosition(),
            isMinimized: true,
            isOpen: false
          });
        }
      } else {
        // First time: set position based on viewport
        setState({
          position: getInitialPosition(),
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
      text: CHAT_BUBBLE_CONFIG.content.initialMessage,
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
      // Calculate max X based on current element width
      let elementWidth = CHAT_BUBBLE_CONFIG.elementWidths.floatingButton;
      if (state.isOpen) {
        elementWidth = CHAT_BUBBLE_CONFIG.elementWidths.chatWindow;
      } else if (state.isMinimized) {
        elementWidth = CHAT_BUBBLE_CONFIG.elementWidths.minimizedPill;
      }
      
      const maxX = window.innerWidth - elementWidth;
      const maxY = window.innerHeight - CHAT_BUBBLE_CONFIG.positioning.maxHeight;
      const minY = CHAT_BUBBLE_CONFIG.positioning.topBoundary; // Prevent header overlap
      setState(prev => ({
        ...prev,
        position: {
          x: Math.max(0, Math.min(prev.position.x, maxX)),
          y: Math.max(minY, Math.min(prev.position.y, maxY))
        }
      }));
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [state]);
  
  // Document-level drag handlers - always attached
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleDocumentMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      
      // Calculate max X based on current element width
      let elementWidth = CHAT_BUBBLE_CONFIG.elementWidths.floatingButton;
      if (state.isOpen) {
        elementWidth = CHAT_BUBBLE_CONFIG.elementWidths.chatWindow;
      } else if (state.isMinimized) {
        elementWidth = CHAT_BUBBLE_CONFIG.elementWidths.minimizedPill;
      }
      
      const maxX = window.innerWidth - elementWidth;
      const minY = CHAT_BUBBLE_CONFIG.positioning.topBoundary; // Prevent header overlap
      const newX = Math.max(0, Math.min(e.clientX - dragStartRef.current.x, maxX));
      const newY = Math.max(minY, Math.min(e.clientY - dragStartRef.current.y, window.innerHeight - CHAT_BUBBLE_CONFIG.positioning.bottomBoundary));
      
      setState(prev => ({
        ...prev,
        position: { x: newX, y: newY }
      }));
    };
    
    const handleDocumentUp = () => {
      isDraggingRef.current = false;
    };
    
    document.addEventListener('mousemove', handleDocumentMove);
    document.addEventListener('mouseup', handleDocumentUp);
    
    return () => {
      document.removeEventListener('mousemove', handleDocumentMove);
      document.removeEventListener('mouseup', handleDocumentUp);
    };
  }, []);
  
  // Pointer Events drag handlers - simple start only
  const handlePointerDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, textarea')) {
      return; // Don't drag when interacting with controls
    }
    
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX - state.position.x,
      y: e.clientY - state.position.y
    };
  };
  
  // Prevent click from firing when dragging
  const handleClickWithDragCheck = (e: React.MouseEvent) => {
    if (isDraggingRef.current) {
      e.preventDefault();
      isDraggingRef.current = false;
      return;
    }
    setAnimationState('opening');
    setState(prev => ({ ...prev, isMinimized: false, isOpen: true }));
    setTimeout(() => setAnimationState('idle'), CHAT_BUBBLE_CONFIG.animations.openingDuration);
  };
  
  // Smart routing handler (role-based)
  const handleChatClick = () => {
    setAnimationState('opening');
    if (!user) {
      // Guest: Open FloatingSupportChat AI flow
      setState(prev => ({ ...prev, isOpen: true, isMinimized: false }));
    } else {
      // Authenticated users: Open chat bubble (support staff and regular users can access their respective dashboards via header navigation)
      setState(prev => ({ ...prev, isOpen: true, isMinimized: false }));
    }
    setTimeout(() => setAnimationState('idle'), CHAT_BUBBLE_CONFIG.animations.openingDuration);
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

  // Request human support - route directly to chat page (identification happens there)
  const handleRequestHumanHelp = () => {
    // Store conversation history for persistence
    sessionStorage.setItem('chat_conversation_history', JSON.stringify(messages));
    setLocation('/chat'); // Route to support chatroom with welcome form
    setState(prev => ({ ...prev, isOpen: false }));
  };
  
  // Send message to HelpAI
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
      
      if (!response.ok) throw new Error('HelpAI API Error');
      
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
  
  // Minimized pill UI - draggable on desktop
  if (state.isMinimized) {
    return (
      <div
        style={{
          position: 'fixed',
          left: `${state.position.x}px`,
          top: `${state.position.y}px`,
          zIndex: CHAT_BUBBLE_CONFIG.zIndex,
          touchAction: CHAT_BUBBLE_CONFIG.touchAction as any,
          cursor: isDraggingRef.current ? 'grabbing' : 'grab',
          userSelect: CHAT_BUBBLE_CONFIG.userSelect as any
        }}
        className={`flex items-center gap-2 bg-gradient-to-r ${CHAT_BUBBLE_CONFIG.colors.primary} ${CHAT_BUBBLE_CONFIG.colors.text} ${CHAT_BUBBLE_CONFIG.effects.rounded} px-${CHAT_BUBBLE_CONFIG.sizes.pillPaddingX} py-${CHAT_BUBBLE_CONFIG.sizes.pillPaddingY} ${CHAT_BUBBLE_CONFIG.effects.shadow} hover-elevate active-elevate-2`}
        onClick={handleClickWithDragCheck}
        onMouseDown={handlePointerDown}
        data-testid="chat-bubble-minimized"
      >
        <MessageCircle className={`w-${CHAT_BUBBLE_CONFIG.sizes.pillIconSize} h-${CHAT_BUBBLE_CONFIG.sizes.pillIconSize}`} />
        <span className="font-medium text-sm">{CHAT_BUBBLE_CONFIG.content.buttonText.liveChat}</span>
      </div>
    );
  }
  
  // Floating button (when closed) - draggable
  if (!state.isOpen) {
    return (
      <div
        style={{
          position: 'fixed',
          left: `${state.position.x}px`,
          top: `${state.position.y}px`,
          zIndex: CHAT_BUBBLE_CONFIG.zIndex,
          touchAction: CHAT_BUBBLE_CONFIG.touchAction as any,
          cursor: isDraggingRef.current ? 'grabbing' : 'grab',
          userSelect: CHAT_BUBBLE_CONFIG.userSelect as any
        }}
        onMouseDown={handlePointerDown}
        onClick={handleClickWithDragCheck}
        className="group"
      >
        <button
          className={`bg-gradient-to-r ${CHAT_BUBBLE_CONFIG.colors.primary} ${CHAT_BUBBLE_CONFIG.colors.text} ${CHAT_BUBBLE_CONFIG.effects.rounded} p-${CHAT_BUBBLE_CONFIG.sizes.buttonPadding} ${CHAT_BUBBLE_CONFIG.effects.shadow} hover:shadow-blue-500/50 hover:scale-110 ${CHAT_BUBBLE_CONFIG.effects.transition} w-${CHAT_BUBBLE_CONFIG.sizes.buttonSize} h-${CHAT_BUBBLE_CONFIG.sizes.buttonSize} flex items-center justify-center pointer-events-none`}
          data-testid="button-open-chat"
        >
          <MessageCircle className={`w-${CHAT_BUBBLE_CONFIG.sizes.buttonIconSize} h-${CHAT_BUBBLE_CONFIG.sizes.buttonIconSize}`} />
          <div className={`absolute -top-1 -right-1 ${CHAT_BUBBLE_CONFIG.colors.error} ${CHAT_BUBBLE_CONFIG.colors.text} text-xs ${CHAT_BUBBLE_CONFIG.effects.rounded} w-5 h-5 flex items-center justify-center font-bold opacity-0 group-hover:opacity-100 ${CHAT_BUBBLE_CONFIG.effects.transitionOpacity}`}>
            !
          </div>
        </button>
      </div>
    );
  }
  
  // Full chat window (guest AI flow)
  return (
    <div
      style={{
        position: 'fixed',
        left: `${state.position.x}px`,
        top: `${state.position.y}px`,
        zIndex: CHAT_BUBBLE_CONFIG.zIndex,
        width: `${CHAT_BUBBLE_CONFIG.sizes.windowWidth}px`,
        maxHeight: `${CHAT_BUBBLE_CONFIG.sizes.windowHeight}px`,
        touchAction: CHAT_BUBBLE_CONFIG.touchAction
      }}
      className={cn(
        `${CHAT_BUBBLE_CONFIG.colors.background} border-2 ${CHAT_BUBBLE_CONFIG.colors.border} ${CHAT_BUBBLE_CONFIG.effects.roundedLg} ${CHAT_BUBBLE_CONFIG.effects.shadow} flex flex-col`,
        animationState === 'opening' && 'chat-bubble-opening',
        animationState === 'closing' && 'chat-bubble-closing',
        animationState === 'minimizing' && 'chat-bubble-minimizing'
      )}
      data-testid="chat-bubble-window"
    >
      {/* Draggable header */}
      <div
        onMouseDown={handlePointerDown}
        className={`p-${CHAT_BUBBLE_CONFIG.sizes.headerPadding} border-b cursor-move bg-gradient-to-r ${CHAT_BUBBLE_CONFIG.colors.secondary} ${CHAT_BUBBLE_CONFIG.effects.roundedLg}`}
        data-testid="chat-bubble-header"
      >
        <div className="flex justify-between items-center">
          <div className="flex-1">
            <h3 className="font-bold text-sm">{CHAT_BUBBLE_CONFIG.content.headerTitle}</h3>
            <p className="text-xs text-muted-foreground">
              {workId} • {orgId}
            </p>
          </div>
          <div className={`flex gap-${CHAT_BUBBLE_CONFIG.sizes.headerGap}`}>
            {user && (
              <Button
                size="icon"
                variant="ghost"
                className={`h-${CHAT_BUBBLE_CONFIG.sizes.headerButtonSize} w-${CHAT_BUBBLE_CONFIG.sizes.headerButtonSize}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleNavigateToDashboard();
                }}
                title={platformRole && ['root_admin', 'support', 'support_manager', 'support_agent'].includes(platformRole) ? "Go to Support Dashboard" : "Go to Team Chat"}
                data-testid="button-navigate-dashboard"
              >
                <ExternalLink className={`w-${CHAT_BUBBLE_CONFIG.sizes.headerIconSize} h-${CHAT_BUBBLE_CONFIG.sizes.headerIconSize}`} />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className={`h-${CHAT_BUBBLE_CONFIG.sizes.headerButtonSize} w-${CHAT_BUBBLE_CONFIG.sizes.headerButtonSize}`}
              onClick={(e) => {
                e.stopPropagation();
                setAnimationState('minimizing');
                setState(prev => ({ ...prev, isMinimized: true }));
                setTimeout(() => setAnimationState('idle'), CHAT_BUBBLE_CONFIG.animations.minimizingDuration);
              }}
              data-testid="button-minimize-chat"
            >
              <Minimize2 className={`w-${CHAT_BUBBLE_CONFIG.sizes.headerIconSize} h-${CHAT_BUBBLE_CONFIG.sizes.headerIconSize}`} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className={`h-${CHAT_BUBBLE_CONFIG.sizes.headerButtonSize} w-${CHAT_BUBBLE_CONFIG.sizes.headerButtonSize}`}
              onClick={(e) => {
                e.stopPropagation();
                setAnimationState('closing');
                setTimeout(() => {
                  setState(prev => ({ ...prev, isOpen: false }));
                  setAnimationState('idle');
                }, CHAT_BUBBLE_CONFIG.animations.closingDuration);
              }}
              data-testid="button-close-chat"
            >
              <X className={`w-${CHAT_BUBBLE_CONFIG.sizes.headerIconSize} h-${CHAT_BUBBLE_CONFIG.sizes.headerIconSize}`} />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Chat messages */}
      <div className={`flex-1 overflow-y-auto p-${CHAT_BUBBLE_CONFIG.sizes.chatAreaPadding} space-y-${CHAT_BUBBLE_CONFIG.sizes.chatAreaSpacing} min-h-[${CHAT_BUBBLE_CONFIG.sizes.chatAreaMinHeight}px] max-h-[${CHAT_BUBBLE_CONFIG.sizes.chatAreaMaxHeight}px]`}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              `flex gap-${CHAT_BUBBLE_CONFIG.sizes.messageGap}`,
              msg.type === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            {msg.type === 'bot' && (
              <div className={`w-${CHAT_BUBBLE_CONFIG.sizes.avatarSize} h-${CHAT_BUBBLE_CONFIG.sizes.avatarSize} rounded-full bg-gradient-to-r ${CHAT_BUBBLE_CONFIG.colors.primary} flex items-center justify-center flex-shrink-0`}>
                <Bot className={`w-${CHAT_BUBBLE_CONFIG.sizes.avatarIconSize} h-${CHAT_BUBBLE_CONFIG.sizes.avatarIconSize} text-white`} />
              </div>
            )}
            <div
              className={cn(
                `rounded-lg px-${CHAT_BUBBLE_CONFIG.sizes.messagePaddingX} py-${CHAT_BUBBLE_CONFIG.sizes.messagePaddingY} max-w-[${CHAT_BUBBLE_CONFIG.sizes.messageMaxWidth}%]`,
                msg.type === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              )}
            >
              <p className="text-sm">{msg.text}</p>
            </div>
            {msg.type === 'user' && (
              <div className={`w-${CHAT_BUBBLE_CONFIG.sizes.avatarSize} h-${CHAT_BUBBLE_CONFIG.sizes.avatarSize} rounded-full bg-muted flex items-center justify-center flex-shrink-0`}>
                <User className={`w-${CHAT_BUBBLE_CONFIG.sizes.avatarIconSize} h-${CHAT_BUBBLE_CONFIG.sizes.avatarIconSize}`} />
              </div>
            )}
          </div>
        ))}
        {(isTyping || isAIActive) && (
          <div className={`flex gap-${CHAT_BUBBLE_CONFIG.sizes.messageGap} justify-start`}>
            <div className={`w-${CHAT_BUBBLE_CONFIG.sizes.avatarSize} h-${CHAT_BUBBLE_CONFIG.sizes.avatarSize} rounded-full bg-gradient-to-r ${CHAT_BUBBLE_CONFIG.colors.primary} flex items-center justify-center`}>
              <Bot className={`w-${CHAT_BUBBLE_CONFIG.sizes.avatarIconSize} h-${CHAT_BUBBLE_CONFIG.sizes.avatarIconSize} text-white`} />
            </div>
            <div className={`bg-muted rounded-lg px-${CHAT_BUBBLE_CONFIG.sizes.messagePaddingX} py-${CHAT_BUBBLE_CONFIG.sizes.messagePaddingY}`}>
              {isAIActive && activityState !== 'IDLE' ? (
                <div className="flex items-center gap-2">
                  <span className={AI_STATE_CONFIG[activityState].color}>
                    {AI_STATE_CONFIG[activityState].icon}
                  </span>
                  <span className={`text-xs ${AI_STATE_CONFIG[activityState].color}`}>
                    {AI_STATE_CONFIG[activityState].label}
                  </span>
                </div>
              ) : (
                <div className="flex gap-1">
                  <div className={`w-${CHAT_BUBBLE_CONFIG.sizes.smallAvatarSize} h-${CHAT_BUBBLE_CONFIG.sizes.smallAvatarSize} bg-muted-foreground rounded-full animate-bounce`} />
                  <div className={`w-${CHAT_BUBBLE_CONFIG.sizes.smallAvatarSize} h-${CHAT_BUBBLE_CONFIG.sizes.smallAvatarSize} bg-muted-foreground rounded-full animate-bounce`} style={{ animationDelay: CHAT_BUBBLE_CONFIG.sizes.typingDelay1 }} />
                  <div className={`w-${CHAT_BUBBLE_CONFIG.sizes.smallAvatarSize} h-${CHAT_BUBBLE_CONFIG.sizes.smallAvatarSize} bg-muted-foreground rounded-full animate-bounce`} style={{ animationDelay: CHAT_BUBBLE_CONFIG.sizes.typingDelay2 }} />
                </div>
              )}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input area - chat input + request help button */}
      <div className={`p-${CHAT_BUBBLE_CONFIG.sizes.inputAreaPadding} border-t space-y-${CHAT_BUBBLE_CONFIG.sizes.inputAreaSpacing}`}>
        <Button
          onClick={handleRequestHumanHelp}
          className={`w-full bg-gradient-to-r ${CHAT_BUBBLE_CONFIG.colors.primary} ${CHAT_BUBBLE_CONFIG.colors.text} hover:${CHAT_BUBBLE_CONFIG.colors.primaryHover}`}
          data-testid="button-human-help"
        >
          <Headset className={`w-${CHAT_BUBBLE_CONFIG.sizes.inputIconSize} h-${CHAT_BUBBLE_CONFIG.sizes.inputIconSize} mr-${CHAT_BUBBLE_CONFIG.sizes.inputIconMarginRight}`} />
          {CHAT_BUBBLE_CONFIG.content.buttonText.requestHelp}
        </Button>
        <div className={`flex gap-${CHAT_BUBBLE_CONFIG.sizes.inputGap}`}>
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={CHAT_BUBBLE_CONFIG.content.messagePlaceholder}
            className="flex-1"
            data-testid="input-chat-message"
          />
          <Button
            onClick={handleSend}
            disabled={!inputValue.trim() || isTyping}
            size="icon"
            data-testid="button-send-message"
          >
            <Send className={`w-${CHAT_BUBBLE_CONFIG.sizes.inputIconSize} h-${CHAT_BUBBLE_CONFIG.sizes.inputIconSize}`} />
          </Button>
        </div>
      </div>
    </div>
  );
}
