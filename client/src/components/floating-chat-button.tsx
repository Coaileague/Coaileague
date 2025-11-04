import { MessageSquare } from "lucide-react";
import { useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";

export function FloatingChatButton() {
  const [location, setLocation] = useLocation();
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);
  
  // Don't show on chat pages - user is already in the chat!
  if (location === "/live-chat" || location === "/mobile-chat") {
    return null;
  }

  // Load saved position from localStorage on mount
  useEffect(() => {
    const savedPosition = localStorage.getItem('chat-button-position');
    if (savedPosition) {
      try {
        const parsed = JSON.parse(savedPosition);
        setPosition(parsed);
      } catch (e) {
        // If parsing fails, use default position
      }
    }
  }, []);

  // Handle touch start
  const handleTouchStart = (e: React.TouchEvent) => {
    // Only enable dragging on mobile (check if screen width < 768px)
    if (window.innerWidth >= 768) return;
    
    const touch = e.touches[0];
    setIsDragging(true);
    hasMoved.current = false;
    dragStart.current = {
      x: touch.clientX - position.x,
      y: touch.clientY - position.y
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
    localStorage.setItem('chat-button-position', JSON.stringify(position));
  };

  // Handle click - only navigate if button wasn't dragged
  const handleClick = () => {
    if (!hasMoved.current) {
      setLocation("/live-chat");
    }
  };

  // Determine button position style
  const getPositionStyle = () => {
    // On mobile, use absolute positioning if dragged
    if (window.innerWidth < 768 && (position.x !== 0 || position.y !== 0)) {
      return {
        position: 'fixed' as const,
        left: `${position.x}px`,
        top: `${position.y}px`,
        bottom: 'auto',
        right: 'auto',
      };
    }
    // Desktop: fixed bottom-right
    return {};
  };

  return (
    <button
      ref={buttonRef}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      data-testid="button-floating-chat"
      className={`fixed bottom-6 right-6 z-50 ${isDragging ? 'cursor-grabbing' : 'cursor-pointer md:cursor-pointer touch-none'}`}
      style={getPositionStyle()}
      aria-label="Open Live Support - Drag to move on mobile"
    >
      <div 
        className="relative flex items-center overflow-hidden bg-[hsl(var(--cad-surface-elevated))] border border-[hsl(var(--cad-border-strong))] rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover-elevate"
        style={{ width: isHovered && !isDragging ? '16rem' : '4rem' }}
      >
        {/* Icon - always visible */}
        <div className="flex-shrink-0 w-16 h-16 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center">
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
        <div className="absolute top-2 right-2 w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
      </div>
    </button>
  );
}
