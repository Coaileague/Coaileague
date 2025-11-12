import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Zap, Search, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { ChatMacro } from "@shared/schema";

interface MacrosDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectMacro: (text: string) => void;
}

export function MacrosDrawer({ 
  open, 
  onOpenChange, 
  onSelectMacro 
}: MacrosDrawerProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: macros = [], isLoading } = useQuery<ChatMacro[]>({
    queryKey: ['/api/chat/macros'],
    enabled: open,
  });

  const filteredMacros = macros.filter(macro => {
    const query = searchQuery.toLowerCase();
    return (
      macro.title.toLowerCase().includes(query) ||
      (macro.shortcut && macro.shortcut.toLowerCase().includes(query)) ||
      macro.content.toLowerCase().includes(query)
    );
  });

  const handleSelectMacro = (macro: ChatMacro) => {
    onSelectMacro(macro.content);
    onOpenChange(false);
    setSearchQuery("");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="bottom" 
        className="h-[80vh] sm:h-auto sm:max-h-[80vh] p-0 overflow-hidden"
        data-testid="sheet-macros"
      >
        <SheetHeader className="p-6 pb-4 border-b-2 border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-emerald-600 dark:text-emerald-400" data-testid="icon-zap" />
            <SheetTitle className="text-slate-800 dark:text-slate-200" data-testid="text-drawer-title">
              Quick Macros
            </SheetTitle>
          </div>
          <SheetDescription className="text-slate-600 dark:text-slate-400" data-testid="text-drawer-description">
            Insert pre-written responses instantly
          </SheetDescription>

          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" data-testid="icon-search" />
            <Input
              placeholder="Search macros..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 border-2 border-slate-200 dark:border-slate-700"
              data-testid="input-search-macros"
            />
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-3" data-testid="div-macros-list">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Loader2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400 animate-spin mb-3" data-testid="icon-loading" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Loading macros...</p>
            </div>
          ) : filteredMacros.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Zap className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {searchQuery ? 'No macros found' : 'No macros available'}
              </p>
            </div>
          ) : (
            filteredMacros.map((macro) => (
              <button
                key={macro.id}
                onClick={() => handleSelectMacro(macro)}
                className="w-full text-left p-4 rounded-lg bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 hover-elevate active-elevate-2 transition-all"
                data-testid={`macro-${macro.id}`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200" data-testid={`text-title-${macro.id}`}>
                    {macro.title}
                  </h3>
                  {macro.shortcut && (
                    <Badge 
                      variant="secondary"
                      className="h-5 px-2 text-[10px] font-mono bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600"
                      data-testid={`badge-shortcut-${macro.id}`}
                    >
                      {macro.shortcut}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2" data-testid={`text-preview-${macro.id}`}>
                  {macro.content}
                </p>
              </button>
            ))
          )}
        </div>

        {!isLoading && filteredMacros.length > 0 && (
          <div className="p-4 border-t-2 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center" data-testid="text-macro-count">
              {filteredMacros.length} {filteredMacros.length === 1 ? 'macro' : 'macros'} available
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
