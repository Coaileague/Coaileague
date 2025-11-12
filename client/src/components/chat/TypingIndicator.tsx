import { Badge } from "@/components/ui/badge";

interface TypingIndicatorProps {
  userName: string;
  isStaff?: boolean;
}

export function TypingIndicator({ userName, isStaff = false }: TypingIndicatorProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 mb-2" data-testid="div-typing-indicator">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400" data-testid="text-typing-user">
          {userName}
        </span>
        {isStaff && (
          <Badge 
            variant="secondary" 
            className="h-4 px-1.5 text-[10px] bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
            data-testid="badge-staff"
          >
            SUPPORT
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1" data-testid="div-typing-dots">
        <span className="w-1.5 h-1.5 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
        <span className="w-1.5 h-1.5 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
        <span className="w-1.5 h-1.5 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
      </div>
    </div>
  );
}
