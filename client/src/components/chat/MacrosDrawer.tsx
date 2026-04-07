import { useState } from "react";
import { UniversalModal, UniversalModalDescription, UniversalModalHeader, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';
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
    <UniversalModal open={open} onOpenChange={onOpenChange}>
      <UniversalModalContent 
        side="bottom" 
        className="h-[100dvh] sm:h-auto sm:max-h-[80vh] p-0 overflow-hidden"
        data-testid="sheet-macros"
      >
        <UniversalModalHeader className="p-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" data-testid="icon-zap" />
            <UniversalModalTitle className="text-foreground" data-testid="text-drawer-title">
              Quick Macros
            </UniversalModalTitle>
          </div>
          <UniversalModalDescription className="text-muted-foreground" data-testid="text-drawer-description">
            Insert pre-written responses instantly
          </UniversalModalDescription>

          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" data-testid="icon-search" />
            <Input
              placeholder="Search macros..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 rounded-full bg-muted/60 border-0 focus-visible:ring-1 focus-visible:ring-primary/30"
              data-testid="input-search-macros"
            />
          </div>
        </UniversalModalHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-2" data-testid="div-macros-list">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Loader2 className="h-8 w-8 text-primary animate-spin mb-3" data-testid="icon-loading" />
              <p className="text-sm text-muted-foreground">Loading macros...</p>
            </div>
          ) : filteredMacros.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Zap className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                {searchQuery ? 'No macros found' : 'No macros available'}
              </p>
            </div>
          ) : (
            filteredMacros.map((macro) => (
              <button
                key={macro.id}
                onClick={() => handleSelectMacro(macro)}
                className="w-full text-left p-4 rounded-lg bg-card border border-border hover-elevate active-elevate-2 transition-all"
                data-testid={`macro-${macro.id}`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="text-sm font-semibold text-foreground" data-testid={`text-title-${macro.id}`}>
                    {macro.title}
                  </h3>
                  {macro.shortcut && (
                    <Badge 
                      variant="secondary"
                      className="h-5 px-2 text-[10px] font-mono"
                      data-testid={`badge-shortcut-${macro.id}`}
                    >
                      {macro.shortcut}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2" data-testid={`text-preview-${macro.id}`}>
                  {macro.content}
                </p>
              </button>
            ))
          )}
        </div>

        {!isLoading && filteredMacros.length > 0 && (
          <div className="p-4 border-t border-border bg-muted/30">
            <p className="text-xs text-muted-foreground text-center" data-testid="text-macro-count">
              {filteredMacros.length} {filteredMacros.length === 1 ? 'macro' : 'macros'} available
            </p>
          </div>
        )}
      </UniversalModalContent>
    </UniversalModal>
  );
}
