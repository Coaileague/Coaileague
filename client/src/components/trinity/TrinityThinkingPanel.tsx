import { useState, useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown, Loader2, CheckCircle2, MinusCircle, XCircle, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Thought {
  timestamp: Date;
  type: 'analyzing' | 'assigned' | 'skipped' | 'failed' | 'info';
  message: string;
}

interface TrinityThinkingPanelProps {
  thoughts: Thought[];
  isVisible: boolean;
}

export function TrinityThinkingPanel({ thoughts, isVisible }: TrinityThinkingPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new thoughts arrive
  useEffect(() => {
    if (scrollRef.current && isExpanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thoughts, isExpanded]);

  if (!isVisible || thoughts.length === 0) return null;

  const getIcon = (type: Thought['type']) => {
    switch (type) {
      case 'analyzing': return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin flex-shrink-0" />;
      case 'assigned': return <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />;
      case 'skipped': return <MinusCircle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />;
      case 'failed': return <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />;
      case 'info': return <Info className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />;
      default: return <MinusCircle className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />;
    }
  };

  const getColor = (type: Thought['type']) => {
    switch (type) {
      case 'analyzing': return 'text-blue-400';
      case 'assigned': return 'text-green-400';
      case 'skipped': return 'text-yellow-400';
      case 'failed': return 'text-red-400';
      case 'info': return 'text-purple-400';
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur border-t border-slate-700 shadow-sm animate-in slide-in-from-bottom duration-300">
      {/* Toggle Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2.5 flex items-center justify-between gap-2 text-sm bg-slate-800/80 hover:bg-slate-800 transition-colors border-b border-slate-700/50"
        data-testid="button-toggle-thinking-panel"
      >
        <span className="flex items-center gap-2">
          {/* Trinity Icon */}
          <svg 
            viewBox="0 0 24 24" 
            className="w-4 h-4 text-purple-400"
            fill="currentColor"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" 
              stroke="currentColor" 
              strokeWidth="2" 
              fill="none"
            />
          </svg>
          <span className="font-medium text-slate-200">Trinity's Thinking</span>
          <Badge variant="secondary" className="text-xs bg-purple-900/50 text-purple-300 border-purple-700">
            {thoughts.length}
          </Badge>
        </span>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="h-36 overflow-y-auto" ref={scrollRef}>
          <div className="p-3 space-y-1.5">
            {thoughts.map((thought, i) => (
              <div 
                key={i} 
                className="flex items-start gap-2 text-sm animate-in fade-in slide-in-from-bottom-2 duration-200"
                style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
              >
                <span className="text-slate-500 text-xs font-mono w-14 flex-shrink-0 pt-0.5">
                  {thought.timestamp.toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false 
                  })}
                </span>
                <span className="flex-shrink-0 w-5 text-center">{getIcon(thought.type)}</span>
                <span className={cn("flex-1 leading-relaxed", getColor(thought.type))}>
                  {thought.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
