import { MessageSquare, X } from "lucide-react";
import { useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";

export function FloatingChatButton() {
  const [location, setLocation] = useLocation();
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  // Load saved position and closed state from localStorage on mount
  useEffect(() => {
    const savedPosition = localStorage.getItem('chat-button-position');
    if (savedPosition) {
      try {
        const parsed = JSON.parse(savedPosition);
        setPosition(parsed);
      } catch (e) {
        // If parsing fails, calculate default position
        setPosition(null);
      }
    }

    // Check if user previously closed the chat button
    const closedState = localStorage.getItem('chat-button-closed');
    if (closedState === 'true') {
      setIsClosed(true);
    }

    // Listen for custom event to re-enable chat button
    const handleReenableChat = () => {
      setIsClosed(false);
      localStorage.removeItem('chat-button-closed');
    };

    window.addEventListener('reenable-chat-button', handleReenableChat);
    
    return () => {
      window.removeEventListener('reenable-chat-button', handleReenableChat);
    };
  }, []);

  // Handle touch start
  const handleTouchStart = (e: React.TouchEvent) => {
    // Only enable dragging on mobile (check if screen width < 768px)
    if (window.innerWidth >= 768 || !buttonRef.current) return;
    
    const touch = e.touches[0];
    const rect = buttonRef.current.getBoundingClientRect();
    
    setIsDragging(true);
    hasMoved.current = false;
    
    // Store the offset between touch point and button's current position
    dragStart.current = {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    };
    
    e.preventDefault(); // Prevent scrolling while dragging
  };

  // Handle touch move
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || window.innerWidth >= 768) return;
    
    const touch = e.touches[0];
    const newX = touch.clientX - dragStart.current.x;
    const newY = touch.clientY - dragStart.current.y;
    
    // Constrain to viewport bounds
    const maxX = window.innerWidth - 80; // Button width
    const maxY = window.innerHeight - 80; // Button height
    
    const constrainedX = Math.max(0, Math.min(newX, maxX));
    const constrainedY = Math.max(0, Math.min(newY, maxY));
    
    setPosition({ x: constrainedX, y: constrainedY });
    hasMoved.current = true;
    e.preventDefault();
  };

  // Handle touch end
  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    
    // Save position to localStorage
    if (position) {
      localStorage.setItem('chat-button-position', JSON.stringify(position));
    }
  };

  // Handle click - only navigate if button wasn't dragged
  const handleClick = () => {
    if (!hasMoved.current) {
      // Detect mobile and send to appropriate chat
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isSmallScreen = window.innerWidth <= 768;
      
      if (isMobileDevice || isSmallScreen) {
        setLocation("/mobile-chat");
      } else {
        setLocation("/chat");
      }
    }
  };

  // Handle close button click
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation when clicking close button
    setIsClosed(true);
    localStorage.setItem('chat-button-closed', 'true');
    // Dispatch custom event to notify other components
    window.dispatchEvent(new Event('chat-button-closed'));
  };

  // Determine button position style
  const getPositionStyle = () => {
    // On mobile, use absolute positioning if position has been set
    if (window.innerWidth < 768 && position) {
      return {
        position: 'fixed' as const,
        left: `${position.x}px`,
        top: `${position.y}px`,
        bottom: 'auto',
        right: 'auto',
      };
    }
    // Desktop or no custom position: fixed bottom-right
    return {};
  };

  // Don't show on chat pages - user is already in the chat!
  if (location === "/chat" || location === "/mobile-chat") {
    return null;
  }

  // Don't show if user closed it
  if (isClosed) {
    return null;
  }

  return (
    <div 
      className="fixed bottom-6 right-6 z-50 group" 
      data-testid="container-floating-chat"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={getPositionStyle()}
    >
      <button
        ref={buttonRef}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        data-testid="button-floating-chat"
        className={`relative ${isDragging ? 'cursor-grabbing' : 'cursor-pointer md:cursor-pointer touch-none'}`}
        aria-label="Open Live Support - Drag to move on mobile"
      >
        <div 
          className="relative flex items-center overflow-hidden bg-[hsl(var(--cad-surface-elevated))] border border-[hsl(var(--cad-border-strong))] rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover-elevate"
          style={{ width: isHovered && !isDragging ? '16rem' : '4rem' }}
        >
          {/* Icon - always visible */}
          <div className="flex-shrink-0 w-16 h-16 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
          </div>
          
          {/* Text Label - only visible on hover (desktop) */}
          <div 
            className={`hidden md:flex flex-col items-start pr-4 transition-opacity duration-300 whitespace-nowrap ${
              isHovered && !isDragging ? 'opacity-100 delay-100' : 'opacity-0'
            }`}
          >
            <span className="text-xs font-semibold text-[hsl(var(--cad-text-primary))]">Live Support</span>
            <span className="text-[10px] text-[hsl(var(--cad-text-tertiary))]">We're here to help</span>
          </div>
          
          {/* Online indicator */}
          <div className="absolute top-2 right-2 w-2.5 h-2.5 bg-muted/30 rounded-full animate-pulse" />
        </div>
      </button>

      {/* Close button - always visible on mobile, hover on desktop */}
      <button
        onClick={handleClose}
        data-testid="button-close-chat-bubble"
        className="absolute -top-2 -right-2 w-6 h-6 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200 shadow-lg"
        aria-label="Close chat bubble"
        title="Close chat bubble"
      >
        <X className="h-3.5 w-3.5 text-slate-300" />
      </button>
    </div>
  );
}
