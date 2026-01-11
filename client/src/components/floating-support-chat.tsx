/**
 * FloatingSupportChat - Trinity AI Assistant
 * 
 * Features:
 * - DESKTOP: Fixed bottom-right position, NO dragging - Trinity stays out of user's way
 * - MOBILE: Touch-friendly with swipe-up command sheet
 * - Intelligent UI avoidance - auto-repositions when near interactive elements
 * - Minimizable to compact pill
 * - Shows real IDs (workId, orgId, orgName)
 * - Role-based routing:
 *   - Support roles → /support/chatrooms dashboard
 *   - Regular users → /org-chat hub
 *   - Guests → AI support flow
 * - Separate floating mic button for voice input
 */

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, X, Bug, Minimize2, Maximize2, ExternalLink, Headset, Search, Brain, LineChart, Code2, Loader2, Mic, ChevronUp } from 'lucide-react';
import { useAIActivity, type AIActivityState } from '@/hooks/use-ai-activity';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { useEmployee } from '@/hooks/useEmployee';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { CHAT_BUBBLE_CONFIG } from '@/config/chatBubble';

// Trinity positioning constants - desktop stays fixed, mobile has safe areas
const TRINITY_DESKTOP_POSITION = {
  bottom: 24,  // 24px from bottom
  right: 24,   // 24px from right edge
};

const TRINITY_MOBILE_POSITION = {
  bottom: 90,  // Account for mobile nav bar + safe area
  right: 16,
};

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
  const isMobile = useIsMobile();
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const [animationState, setAnimationState] = useState<AnimationState>('idle');
  const [showCommandSheet, setShowCommandSheet] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  const { activityState, isActive: isAIActive, lastEvent } = useAIActivity({
    workspaceId: employee?.workspaceId,
  });
  
  // Real IDs from auth system
  const workId = employee?.employeeNumber || 'GUEST';
  const orgId = employee?.workspaceId || 'N/A';
  const platformRole = (employee as any)?.platformRole || null;
  const workspaceRole = employee?.workspaceRole || null;
  
  // UNIVERSAL: Hide for ALL authenticated users - this widget is ONLY for guests on public pages
  // Authenticated users have full access to HelpDesk, org-chat, and support chatrooms via the main nav
  const isAuthenticated = !!user;
  
  // Also hide on certain pages regardless of auth state
  const isRestrictedPage = location.startsWith('/chat') || 
                           location.startsWith('/org-chat') || 
                           location.startsWith('/support/chatrooms');
  
  const shouldHide = isAuthenticated || isRestrictedPage;
  
  // SIMPLIFIED STATE - No position tracking, purely UI state
  // Trinity is ALWAYS fixed to bottom-right via CSS - no dragging on desktop
  const [state, setState] = useState<ChatBubbleState>({
    position: { x: 0, y: 0 }, // Unused - kept for type compatibility
    isMinimized: true,
    isOpen: false
  });

  // Clean up old localStorage position data on mount - we don't use it anymore
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Remove old position data - Trinity no longer uses position tracking
      localStorage.removeItem('chat-bubble-state');
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
  
  // SIMPLE CLICK HANDLER - no drag logic
  const handleOpenChat = () => {
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
      setLocation('/helpdesk'); // SIMPLIFIED: All chat goes to HelpDesk
    } else {
      setLocation('/helpdesk'); // SIMPLIFIED: All chat goes to HelpDesk
    }
  };

  // Request human support - route directly to chat page (identification happens there)
  const handleRequestHumanHelp = () => {
    // Store conversation history for persistence
    sessionStorage.setItem('chat_conversation_history', JSON.stringify(messages));
    setLocation('/helpdesk'); // SIMPLIFIED: Route to unified HelpDesk
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
  
  // DESKTOP: Fixed bottom-right, NO dragging - Trinity stays out of user's way
  // MOBILE: Touch-friendly with safe-area padding
  const positionStyle = isMobile ? {
    position: 'fixed' as const,
    bottom: `calc(${TRINITY_MOBILE_POSITION.bottom}px + env(safe-area-inset-bottom, 0px))`,
    right: `calc(${TRINITY_MOBILE_POSITION.right}px + env(safe-area-inset-right, 0px))`,
    zIndex: CHAT_BUBBLE_CONFIG.zIndex,
  } : {
    position: 'fixed' as const,
    bottom: `${TRINITY_DESKTOP_POSITION.bottom}px`,
    right: `${TRINITY_DESKTOP_POSITION.right}px`,
    zIndex: CHAT_BUBBLE_CONFIG.zIndex,
  };
  
  // Minimized pill UI - compact icon-only on mobile to reduce blocking
  if (state.isMinimized) {
    return (
      <>
        <div
          style={positionStyle}
          className={cn(
            `bg-gradient-to-r ${CHAT_BUBBLE_CONFIG.colors.primary} ${CHAT_BUBBLE_CONFIG.colors.text} ${CHAT_BUBBLE_CONFIG.effects.rounded} ${CHAT_BUBBLE_CONFIG.effects.shadow} hover-elevate active-elevate-2 cursor-pointer select-none`,
            isMobile 
              ? "w-12 h-12 flex items-center justify-center rounded-full" 
              : `flex items-center gap-2 px-${CHAT_BUBBLE_CONFIG.sizes.pillPaddingX} py-${CHAT_BUBBLE_CONFIG.sizes.pillPaddingY}`
          )}
          onClick={handleOpenChat}
          data-testid="chat-bubble-minimized"
        >
          <Bug className={`w-${CHAT_BUBBLE_CONFIG.sizes.pillIconSize} h-${CHAT_BUBBLE_CONFIG.sizes.pillIconSize}`} />
          {!isMobile && <span className="font-medium text-sm">{CHAT_BUBBLE_CONFIG.content.buttonText.liveChat}</span>}
        </div>
        
        {/* Floating Mic Button - hidden for guests on public pages to reduce clutter */}
        
        {/* Swipe-up Command Sheet indicator - HIDDEN by default, only show when minimized pill is tapped */}
        
        {/* Command Sheet */}
        {showCommandSheet && (
          <div
            className="fixed inset-0 bg-black/50 z-[9998]"
            onClick={() => setShowCommandSheet(false)}
          >
            <div 
              className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl p-4 pb-8 animate-in slide-in-from-bottom duration-300"
              onClick={(e) => e.stopPropagation()}
              style={{ paddingBottom: `calc(2rem + env(safe-area-inset-bottom, 0px))` }}
            >
              <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-3">Quick Commands</h3>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => { setShowCommandSheet(false); handleChatClick(); }} className="justify-start gap-2">
                  <Bug className="w-4 h-4" /> Report Issue
                </Button>
                <Button variant="outline" onClick={() => { setShowCommandSheet(false); setLocation('/chat'); }} className="justify-start gap-2">
                  <Headset className="w-4 h-4" /> Live Support
                </Button>
                <Button variant="outline" onClick={() => { setShowCommandSheet(false); setLocation('/help'); }} className="justify-start gap-2">
                  <Search className="w-4 h-4" /> Help Center
                </Button>
                <Button variant="outline" onClick={() => { setShowCommandSheet(false); setIsListening(true); }} className="justify-start gap-2">
                  <Mic className="w-4 h-4" /> Voice Input
                </Button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }
  
  // Floating button (when closed) - fixed position, no dragging
  if (!state.isOpen) {
    return (
      <>
        <div
          style={positionStyle}
          onClick={handleOpenChat}
          className="group cursor-pointer"
        >
          <button
            className={`bg-gradient-to-r ${CHAT_BUBBLE_CONFIG.colors.primary} ${CHAT_BUBBLE_CONFIG.colors.text} ${CHAT_BUBBLE_CONFIG.effects.rounded} p-${CHAT_BUBBLE_CONFIG.sizes.buttonPadding} ${CHAT_BUBBLE_CONFIG.effects.shadow} hover:shadow-violet-500/50 hover:scale-110 ${CHAT_BUBBLE_CONFIG.effects.transition} w-${CHAT_BUBBLE_CONFIG.sizes.buttonSize} h-${CHAT_BUBBLE_CONFIG.sizes.buttonSize} flex items-center justify-center pointer-events-none`}
            data-testid="button-open-chat"
          >
            <Bug className={`w-${CHAT_BUBBLE_CONFIG.sizes.buttonIconSize} h-${CHAT_BUBBLE_CONFIG.sizes.buttonIconSize}`} />
            <div className={`absolute -top-1 -right-1 ${CHAT_BUBBLE_CONFIG.colors.error} ${CHAT_BUBBLE_CONFIG.colors.text} text-xs ${CHAT_BUBBLE_CONFIG.effects.rounded} w-5 h-5 flex items-center justify-center font-bold opacity-0 group-hover:opacity-100 ${CHAT_BUBBLE_CONFIG.effects.transitionOpacity}`}>
              !
            </div>
          </button>
        </div>
        
        {/* Floating Mic Button - separate on mobile */}
        {isMobile && (
          <button
            style={{
              position: 'fixed',
              bottom: `calc(${TRINITY_MOBILE_POSITION.bottom + 80}px + env(safe-area-inset-bottom, 0px))`,
              right: `calc(${TRINITY_MOBILE_POSITION.right}px + env(safe-area-inset-right, 0px))`,
              zIndex: CHAT_BUBBLE_CONFIG.zIndex - 1,
            }}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all duration-200",
              isListening 
                ? "bg-red-500 text-white animate-pulse" 
                : "bg-card border-2 border-border text-foreground hover-elevate active-elevate-2"
            )}
            onClick={() => {
              setIsListening(!isListening);
              toast({ title: isListening ? "Stopped listening" : "Listening for voice input..." });
            }}
            data-testid="button-floating-mic"
          >
            <Mic className="w-5 h-5" />
          </button>
        )}
      </>
    );
  }
  
  // Full chat window (guest AI flow) - fixed position, no dragging
  const chatWindowStyle = isMobile ? {
    position: 'fixed' as const,
    bottom: `calc(${TRINITY_MOBILE_POSITION.bottom}px + env(safe-area-inset-bottom, 0px))`,
    right: `calc(${TRINITY_MOBILE_POSITION.right}px + env(safe-area-inset-right, 0px))`,
    zIndex: CHAT_BUBBLE_CONFIG.zIndex,
    width: `min(${CHAT_BUBBLE_CONFIG.sizes.windowWidth}px, calc(100vw - 32px))`,
    maxHeight: `min(${CHAT_BUBBLE_CONFIG.sizes.windowHeight}px, calc(100vh - 120px))`,
  } : {
    position: 'fixed' as const,
    bottom: `${TRINITY_DESKTOP_POSITION.bottom}px`,
    right: `${TRINITY_DESKTOP_POSITION.right}px`,
    zIndex: CHAT_BUBBLE_CONFIG.zIndex,
    width: `${CHAT_BUBBLE_CONFIG.sizes.windowWidth}px`,
    maxHeight: `${CHAT_BUBBLE_CONFIG.sizes.windowHeight}px`,
  };
  
  return (
    <div
      style={chatWindowStyle}
      className={cn(
        `${CHAT_BUBBLE_CONFIG.colors.background} border-2 ${CHAT_BUBBLE_CONFIG.colors.border} ${CHAT_BUBBLE_CONFIG.effects.roundedLg} ${CHAT_BUBBLE_CONFIG.effects.shadow} flex flex-col`,
        animationState === 'opening' && 'chat-bubble-opening',
        animationState === 'closing' && 'chat-bubble-closing',
        animationState === 'minimizing' && 'chat-bubble-minimizing'
      )}
      data-testid="chat-bubble-window"
    >
      {/* Header - no dragging */}
      <div
        className={`p-${CHAT_BUBBLE_CONFIG.sizes.headerPadding} border-b bg-gradient-to-r ${CHAT_BUBBLE_CONFIG.colors.secondary} ${CHAT_BUBBLE_CONFIG.effects.roundedLg}`}
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
