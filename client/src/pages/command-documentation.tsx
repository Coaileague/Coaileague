/**
 * Command Documentation Page
 * Comprehensive IRC-style command reference with RBAC-aware display
 * 
 * Features:
 * - All commands organized by category
 * - Lock icons for restricted commands (RBAC)
 * - Search and filter
 * - Mobile responsive
 * - Flags for force/destructive/punishment commands
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Lock, 
  Unlock, 
  Terminal, 
  Bot, 
  Shield, 
  Headset, 
  Settings, 
  Search,
  AlertTriangle,
  Trash2,
  Ban,
  Eye,
  ChevronRight,
  Copy,
  Check
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';

interface DocumentedCommand {
  command: string;
  usage: string;
  description: string;
  category: 'system' | 'bot' | 'moderation' | 'administrative' | 'support';
  source: string;
  minRole: string;
  isForceCommand: boolean;
  isDestructive: boolean;
  isPunishment: boolean;
  requiresAudit: boolean;
  examples: string[];
  flags: string[];
  canExecute: boolean;
  locked: boolean;
}

interface CommandsResponse {
  success: boolean;
  userRole: string;
  totalCommands: number;
  accessibleCommands: number;
  lockedCommands: number;
  commands: DocumentedCommand[];
  categorized: Record<string, DocumentedCommand[]>;
}

const CATEGORY_CONFIG = {
  system: { 
    name: 'System', 
    icon: Terminal, 
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    description: 'Core commands available in all rooms'
  },
  bot: { 
    name: 'Bot Commands', 
    icon: Bot, 
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    description: 'Commands handled by AI bots'
  },
  moderation: { 
    name: 'Moderation', 
    icon: Shield, 
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    description: 'Room and user management'
  },
  support: { 
    name: 'Support', 
    icon: Headset, 
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    description: 'Support staff utilities'
  },
  administrative: { 
    name: 'Admin', 
    icon: Settings, 
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    description: 'Platform administration'
  },
};

function CommandCard({ cmd, expanded, onToggle }: { 
  cmd: DocumentedCommand; 
  expanded: boolean;
  onToggle: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const copyCommand = () => {
    navigator.clipboard.writeText(cmd.command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Copied!', description: `${cmd.command} copied to clipboard` });
  };

  const catConfig = CATEGORY_CONFIG[cmd.category] || CATEGORY_CONFIG.system;
  const Icon = catConfig.icon;

  return (
    <Card 
      className={`transition-all ${cmd.locked ? 'opacity-70' : ''} hover-elevate cursor-pointer`}
      onClick={onToggle}
      data-testid={`command-card-${cmd.command.replace('/', '')}`}
    >
      <CardHeader className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {cmd.locked ? (
              <Lock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            ) : (
              <Unlock className="h-4 w-4 text-green-500 flex-shrink-0" />
            )}
            <code className="text-[13px] sm:text-sm font-mono font-semibold truncate">
              {cmd.command}
            </code>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {cmd.isForceCommand && (
              <Badge variant="destructive" className="text-[10px] px-1">
                FORCE
              </Badge>
            )}
            {cmd.isDestructive && (
              <Trash2 className="h-3 w-3 text-destructive" />
            )}
            {cmd.isPunishment && (
              <Ban className="h-3 w-3 text-orange-500" />
            )}
            {cmd.requiresAudit && (
              <Eye className="h-3 w-3 text-blue-500" />
            )}
            <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </div>
        </div>
        <CardDescription className="text-[11px] sm:text-xs mt-1 line-clamp-2">
          {cmd.description}
        </CardDescription>
      </CardHeader>
      
      {expanded && (
        <CardContent className="p-3 sm:p-4 pt-0 border-t">
          <div className="space-y-3 text-[12px] sm:text-sm">
            <div>
              <span className="text-muted-foreground">Usage:</span>
              <code className="ml-2 bg-muted px-2 py-1 rounded text-[11px] sm:text-xs">
                {cmd.usage}
              </code>
            </div>
            
            <div className="flex flex-wrap gap-1">
              <span className="text-muted-foreground">Source:</span>
              <Badge variant="outline" className={`${catConfig.bgColor} text-[10px]`}>
                <Icon className="h-3 w-3 mr-1" />
                {cmd.source}
              </Badge>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Min Role:</span>
              <Badge variant={cmd.locked ? 'secondary' : 'default'} className="text-[10px]">
                {cmd.minRole}
              </Badge>
              {cmd.locked && (
                <span className="text-[10px] text-muted-foreground">(requires higher access)</span>
              )}
            </div>
            
            {cmd.flags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-muted-foreground">Flags:</span>
                {cmd.flags.map(flag => (
                  <Badge 
                    key={flag} 
                    variant="outline" 
                    className={`text-[9px] ${
                      flag === 'FORCE' || flag === 'DESTRUCTIVE' 
                        ? 'border-destructive text-destructive' 
                        : flag === 'AUDIT_LOGGED'
                        ? 'border-blue-500 text-blue-500'
                        : 'border-yellow-500 text-yellow-500'
                    }`}
                  >
                    {flag}
                  </Badge>
                ))}
              </div>
            )}
            
            {cmd.examples.length > 0 && (
              <div>
                <span className="text-muted-foreground block mb-1">Examples:</span>
                <div className="space-y-1">
                  {cmd.examples.slice(0, 3).map((ex, i) => (
                    <code key={i} className="block bg-muted px-2 py-1 rounded text-[10px] sm:text-xs">
                      {ex}
                    </code>
                  ))}
                </div>
              </div>
            )}
            
            <Button 
              size="sm" 
              variant="outline" 
              onClick={(e) => { e.stopPropagation(); copyCommand(); }}
              className="w-full mt-2"
              data-testid={`copy-command-${cmd.command.replace('/', '')}`}
            >
              {copied ? <Check className="h-3 w-3 mr-2" /> : <Copy className="h-3 w-3 mr-2" />}
              Copy Command
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function CommandDocumentationPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCmd, setExpandedCmd] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('all');

  const { data, isLoading } = useQuery<CommandsResponse>({
    queryKey: ['/api/commands'],
  });

  const filteredCommands = (data?.commands || []).filter(cmd => {
    const matchesSearch = !searchQuery || 
      cmd.command.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.source.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesTab = activeTab === 'all' || 
      cmd.category === activeTab ||
      (activeTab === 'accessible' && cmd.canExecute) ||
      (activeTab === 'locked' && cmd.locked);
    
    return matchesSearch && matchesTab;
  });

  const roleInfo = (
    <Badge variant="outline" className="w-fit">
      Your Role: <span className="ml-1 font-semibold">{data?.userRole || 'user'}</span>
    </Badge>
  );

  const pageConfig: CanvasPageConfig = {
    id: 'command-documentation',
    title: 'Command Reference',
    subtitle: `${data?.totalCommands || 0} commands | ${data?.accessibleCommands || 0} accessible | ${data?.lockedCommands || 0} locked`,
    category: 'operations',
    headerActions: roleInfo,
  };

  if (isLoading) {
    return (
      <CanvasHubPage config={pageConfig}>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </CanvasHubPage>
    );
  }

  return (
    <CanvasHubPage config={pageConfig}>
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 mb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search commands..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-[13px] sm:text-sm"
            data-testid="search-commands"
          />
        </div>
      </div>

      {/* Legend */}
      <div className="flex-shrink-0 px-3 sm:px-4 py-2 border-b bg-muted/30">
        <div className="flex flex-wrap items-center gap-3 text-[10px] sm:text-xs">
          <span className="text-muted-foreground">Legend:</span>
          <div className="flex items-center gap-1">
            <Lock className="h-3 w-3" />
            <span>Locked</span>
          </div>
          <div className="flex items-center gap-1">
            <Unlock className="h-3 w-3 text-green-500" />
            <span>Accessible</span>
          </div>
          <div className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-destructive" />
            <span>Force</span>
          </div>
          <div className="flex items-center gap-1">
            <Eye className="h-3 w-3 text-blue-500" />
            <span>Audited</span>
          </div>
          <div className="flex items-center gap-1">
            <Trash2 className="h-3 w-3 text-destructive" />
            <span>Destructive</span>
          </div>
          <div className="flex items-center gap-1">
            <Ban className="h-3 w-3 text-orange-500" />
            <span>Punishment</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="flex-shrink-0 px-3 sm:px-4 pt-2 border-b overflow-x-auto">
          <TabsList className="h-8 w-auto inline-flex">
            <TabsTrigger value="all" className="text-[11px] sm:text-xs px-2 sm:px-3">
              All ({data?.totalCommands || 0})
            </TabsTrigger>
            <TabsTrigger value="accessible" className="text-[11px] sm:text-xs px-2 sm:px-3">
              <Unlock className="h-3 w-3 mr-1" />
              Accessible
            </TabsTrigger>
            <TabsTrigger value="locked" className="text-[11px] sm:text-xs px-2 sm:px-3">
              <Lock className="h-3 w-3 mr-1" />
              Locked
            </TabsTrigger>
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
              const Icon = config.icon;
              const count = data?.categorized?.[key]?.length || 0;
              return (
                <TabsTrigger key={key} value={key} className="text-[11px] sm:text-xs px-2 sm:px-3">
                  <Icon className={`h-3 w-3 mr-1 ${config.color}`} />
                  <span className="hidden sm:inline">{config.name}</span>
                  <span className="sm:hidden">{count}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <TabsContent value={activeTab} className="flex-1 m-0 min-h-0">
          <ScrollArea className="h-full">
            <div className="p-3 sm:p-4 space-y-2">
              {filteredCommands.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Terminal className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No commands found</p>
                  {searchQuery && (
                    <p className="text-xs mt-1">Try a different search term</p>
                  )}
                </div>
              ) : (
                filteredCommands.map(cmd => (
                  <CommandCard
                    key={cmd.command}
                    cmd={cmd}
                    expanded={expandedCmd === cmd.command}
                    onToggle={() => setExpandedCmd(
                      expandedCmd === cmd.command ? null : cmd.command
                    )}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Footer with audit notice */}
      <div className="flex-shrink-0 p-2 sm:p-3 border-t bg-muted/30">
        <div className="flex items-center gap-2 text-[10px] sm:text-xs text-muted-foreground">
          <Eye className="h-3 w-3" />
          <span>
            Commands marked with audit flag are logged for transparency. 
            Attempting locked commands triggers security alerts.
          </span>
        </div>
      </div>
    </div>
    </CanvasHubPage>
  );
}
