/**
 * TrinityAnnouncement Component
 * 
 * Displays Trinity AI announcements as speech bubbles.
 * Replaces generic toast notifications with personalized Trinity messages.
 */

import { useEffect, useState, useCallback } from 'react';
import { TrinityAnimatedLogo } from "@/components/ui/trinity-animated-logo";
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { TrinityLogo } from '@/components/ui/coaileague-logo-mark';
import { Button } from '@/components/ui/button';
import { 
  useTrinityAnnouncement, 
  dismissAnnouncement,
  type TrinityAnnouncement as AnnouncementType,
  type AnnouncementType as MessageType 
} from '@/hooks/use-trinity-announcement';

interface TrinityAnnouncementDisplayProps {
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  maxVisible?: number;
}

const typeStyles: Record<MessageType, { 
  bg: string; 
  border: string; 
  icon: React.ComponentType<any>;
  iconColor: string;
}> = {
  success: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/50',
    border: 'border-emerald-200 dark:border-emerald-800',
    icon: CheckCircle2,
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-950/50',
    border: 'border-red-200 dark:border-red-800',
    icon: AlertCircle,
    iconColor: 'text-red-600 dark:text-red-400',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-950/50',
    border: 'border-amber-200 dark:border-amber-800',
    icon: AlertTriangle,
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  info: {
    bg: 'bg-blue-50 dark:bg-blue-950/50',
    border: 'border-blue-200 dark:border-blue-800',
    icon: Info,
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  celebration: {
    bg: 'bg-gradient-to-r from-violet-50 to-fuchsia-50 dark:from-violet-950/50 dark:to-fuchsia-950/50',
    border: 'border-violet-200 dark:border-violet-800',
    icon: TrinityLogo,
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
};

const positionStyles: Record<string, string> = {
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'top-right': 'top-20 right-4',
  'top-left': 'top-20 left-4',
};

function AnnouncementBubble({ 
  announcement, 
  onDismiss 
}: { 
  announcement: AnnouncementType; 
  onDismiss: () => void;
}) {
  const style = typeStyles[announcement.type] ?? typeStyles.info;
  const Icon = style.icon;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={`
        relative max-w-sm w-full rounded-lg border shadow-sm p-4
        ${style.bg} ${style.border}
      `}
      data-testid={`trinity-announcement-${announcement.id}`}
    >
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 ${style.iconColor}`}>
          {Icon === TrinityLogo ? <TrinityAnimatedLogo size={20} /> : <Icon className="h-5 w-5" />}
        </div>
        
        <div className="flex-1 min-w-0">
          {announcement.title && (
            <h4 className="font-semibold text-sm text-foreground mb-1">
              {announcement.title}
            </h4>
          )}
          <p className="text-sm text-muted-foreground leading-relaxed">
            {announcement.message}
          </p>
          
          {announcement.action && (
            <Button
              variant="link"
              size="sm"
              className="mt-2 p-0 h-auto"
              onClick={() => {
                announcement.action?.onClick();
                onDismiss();
              }}
              data-testid="button-announcement-action"
            >
              {announcement.action.label}
            </Button>
          )}
        </div>
        
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0 -mt-1 -mr-1"
          onClick={onDismiss}
          data-testid="button-dismiss-announcement"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <div 
        className={`
          absolute -left-2 bottom-4 w-4 h-4 rotate-45
          border-l border-b ${style.border} ${style.bg}
        `}
        style={{ clipPath: 'polygon(0 0, 0 100%, 100% 100%)' }}
      />
    </motion.div>
  );
}

export function TrinityAnnouncementDisplay({ 
  position = 'bottom-right',
  maxVisible = 3,
}: TrinityAnnouncementDisplayProps) {
  const { announcements } = useTrinityAnnouncement();
  const visibleAnnouncements = announcements.slice(0, maxVisible);
  
  return (
    <div 
      className={`fixed ${positionStyles[position]} flex flex-col gap-2 pointer-events-none`}
      style={{ zIndex: 10010 }}
      data-testid="trinity-announcement-container"
    >
      <AnimatePresence mode="popLayout">
        {visibleAnnouncements.map((announcement) => (
          <div key={announcement.id} className="pointer-events-auto">
            <AnnouncementBubble
              announcement={announcement}
              onDismiss={() => dismissAnnouncement(announcement.id)}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function useTrinityAnnouncementListener() {
  const [lastAnnouncement, setLastAnnouncement] = useState<AnnouncementType | null>(null);
  
  useEffect(() => {
    const handleAnnounce = (e: CustomEvent<AnnouncementType>) => {
      setLastAnnouncement(e.detail);
    };
    
    const handleDismiss = () => {
      setLastAnnouncement(null);
    };
    
    const handleClear = () => {
      setLastAnnouncement(null);
    };
    
    window.addEventListener('trinity_announce', handleAnnounce as EventListener);
    window.addEventListener('trinity_dismiss', handleDismiss as EventListener);
    window.addEventListener('trinity_clear', handleClear as EventListener);
    
    return () => {
      window.removeEventListener('trinity_announce', handleAnnounce as EventListener);
      window.removeEventListener('trinity_dismiss', handleDismiss as EventListener);
      window.removeEventListener('trinity_clear', handleClear as EventListener);
    };
  }, []);
  
  return lastAnnouncement;
}

export default TrinityAnnouncementDisplay;
