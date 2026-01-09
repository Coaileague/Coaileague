/**
 * FLOATING TRINITY BUTTON
 * =======================
 * Persistent, always-visible Trinity Chat access point.
 * Appears across all workspace pages for easy navigation.
 * RBAC-aware: only shows to allowed roles.
 */

import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { X } from 'lucide-react';
import { TrinityIconStatic } from '@/components/trinity-button';
import { useWorkspaceAccess } from '@/hooks/useWorkspaceAccess';
import { isTrinityAccessAllowed } from '@/config/trinity';

export function FloatingTrinityButton() {
  const [location, setLocation] = useLocation();
  const [isDragging, setIsDragging] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  const { workspaceRole, isPlatformStaff, isLoading } = useWorkspaceAccess();

  useEffect(() => {
    const savedPosition = localStorage.getItem('trinity-button-position');
    if (savedPosition) {
      try {
        const parsed = JSON.parse(savedPosition);
        setPosition(parsed);
      } catch (e) {
        setPosition(null);
      }
    }

    const closedState = localStorage.getItem('trinity-button-closed');
    if (closedState === 'true') {
      setIsClosed(true);
    }

    const handleReenableTrinity = () => {
      setIsClosed(false);
      localStorage.removeItem('trinity-button-closed');
    };

    window.addEventListener('reenable-trinity-button', handleReenableTrinity);
    
    return () => {
      window.removeEventListener('reenable-trinity-button', handleReenableTrinity);
    };
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.innerWidth >= 768 || !buttonRef.current) return;
    
    const touch = e.touches[0];
    const rect = buttonRef.current.getBoundingClientRect();
    
    setIsDragging(true);
    hasMoved.current = false;
    
    dragStart.current = {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || window.innerWidth >= 768) return;
    
    const touch = e.touches[0];
    const newX = touch.clientX - dragStart.current.x;
    const newY = touch.clientY - dragStart.current.y;
    
    const maxX = window.innerWidth - 80;
    const maxY = window.innerHeight - 80;
    
    const constrainedX = Math.max(0, Math.min(newX, maxX));
    const constrainedY = Math.max(0, Math.min(newY, maxY));
    
    setPosition({ x: constrainedX, y: constrainedY });
    hasMoved.current = true;
    e.preventDefault();
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    
    if (position) {
      localStorage.setItem('trinity-button-position', JSON.stringify(position));
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (hasMoved.current) {
      e.preventDefault();
      e.stopPropagation();
      hasMoved.current = false;
      return;
    }
    setLocation('/trinity');
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsClosed(true);
    localStorage.setItem('trinity-button-closed', 'true');
    window.dispatchEvent(new Event('trinity-button-closed'));
  };

  const getPositionStyle = () => {
    if (window.innerWidth < 768 && position) {
      return {
        position: 'fixed' as const,
        left: `${position.x}px`,
        top: `${position.y}px`,
        bottom: 'auto',
        right: 'auto',
      };
    }
    return {};
  };

  if (isLoading) return null;

  const platformRole = isPlatformStaff ? 'root_admin' : undefined;
  if (!isTrinityAccessAllowed(workspaceRole, platformRole)) {
    return null;
  }

  if (location === '/trinity') {
    return null;
  }

  if (isClosed) {
    return null;
  }

  const excludedPaths = ['/login', '/register', '/onboarding', '/landing', '/'];
  if (excludedPaths.some(path => location === path || location.startsWith('/onboarding'))) {
    return null;
  }

  return (
    <button
      ref={buttonRef}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      data-testid="button-floating-trinity"
      className={`fixed bottom-36 md:bottom-6 right-6 z-40 group relative ${isDragging ? 'cursor-grabbing' : 'cursor-pointer md:cursor-pointer touch-none'}`}
      style={getPositionStyle()}
      aria-label="Open Trinity Chat - Drag to move on mobile"
    >
      <div 
        className="relative flex items-center justify-center bg-gradient-to-br from-[#00BFFF] via-[#3b82f6] to-[#FFD700] border border-blue-500/30 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 w-14 h-14 md:w-12 md:h-12"
      >
        <div className="w-8 h-8 md:w-7 md:h-7 flex items-center justify-center">
          <TrinityIconStatic size={28} />
        </div>
        <div className="absolute top-0.5 right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse" />
      </div>

      <span
        onClick={handleClose}
        data-testid="button-close-trinity-fab"
        className="absolute -top-2 -right-2 w-6 h-6 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200 shadow-lg cursor-pointer"
        aria-label="Close Trinity button"
        title="Close Trinity button"
      >
        <X className="h-3.5 w-3.5 text-slate-300" />
      </span>
    </button>
  );
}
