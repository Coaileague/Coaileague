import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard, Calendar, Clock, Users, UserCircle, FileText,
  BarChart3, Settings, ClipboardCheck, Activity, HelpCircle, LogOut,
  Zap, DollarSign, Mail, Shield, MessageSquare, Building2, AlertTriangle,
  File, Search, Loader2, X,
} from "lucide-react";
import { performLogout, setLogoutTransitionLoader } from "@/lib/logoutHandler";
import { useTransitionLoaderIfMounted } from "@/components/canvas-hub";
import { Badge } from "@/components/ui/badge";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SearchResult {
  entity_type: string;
  entity_id: string;
  display_name: string;
  subtitle: string;
  relevance_score: number;
  created_at: string | null;
  deep_link: string;
  icon: string;
}

interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
  took_ms: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RECENT_SEARCHES_KEY = 'coai_recent_searches';
const MAX_RECENT = 8;

const ENTITY_ICONS: Record<string, typeof Users> = {
  officer: Users,
  client: Building2,
  shift: Calendar,
  invoice: FileText,
  incident: AlertTriangle,
  support_ticket: HelpCircle,
  document: File,
  audit_log: Shield,
};

const ENTITY_LABELS: Record<string, string> = {
  officer: 'Officers',
  client: 'Clients',
  shift: 'Shifts',
  invoice: 'Invoices',
  incident: 'Incidents',
  support_ticket: 'Support Tickets',
  document: 'Documents',
  audit_log: 'Audit Log',
};

// ── Recent searches helpers ───────────────────────────────────────────────────

function getRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
  } catch {
    return [];
  }
}

function addRecentSearch(q: string) {
  if (!q || q.trim().length < 2) return;
  try {
    const existing = getRecentSearches().filter(s => s !== q.trim());
    const updated = [q.trim(), ...existing].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch {}
}

function clearRecentSearches() {
  try { localStorage.removeItem(RECENT_SEARCHES_KEY); } catch {}
}

// ── Log result click ──────────────────────────────────────────────────────────

async function logClick(entityType: string, entityId: string) {
  try {
    await fetch('/api/search/log-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId }),
    });
  } catch {}
}

// ── Main component ────────────────────────────────────────────────────────────

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [, setLocation] = useLocation();
  const transitionLoader = useTransitionLoaderIfMounted();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (transitionLoader) setLogoutTransitionLoader(transitionLoader);
  }, [transitionLoader]);

  // ── Keyboard shortcut ──────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // ── Load recents on open ───────────────────────────────────────────────────
  useEffect(() => {
    if (open) setRecentSearches(getRecentSearches());
    else {
      // Reset state on close
      setInputValue('');
      setSearchResults([]);
      setSearchTotal(0);
      setIsSearching(false);
    }
  }, [open]);

  // ── Global open function ───────────────────────────────────────────────────
  useEffect(() => {
    (window as any).openCommandPalette = () => setOpen(true);
  }, []);

  // ── Debounced live search ──────────────────────────────────────────────────
  const performSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (q.trim().length < 2) {
      setSearchResults([]);
      setSearchTotal(0);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}&limit=30`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Search failed');
        const json = await res.json();
        if (json.success && json.data) {
          const data: SearchResponse = json.data;
          setSearchResults(data.results);
          setSearchTotal(data.total);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setSearchResults([]);
          setSearchTotal(0);
        }
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  const handleInputChange = useCallback((val: string) => {
    setInputValue(val);
    performSearch(val);
  }, [performSearch]);

  // ── Navigation helpers ─────────────────────────────────────────────────────
  const navigate = useCallback((path: string) => {
    setLocation(path);
  }, [setLocation]);

  const handleSelect = useCallback((callback: () => void) => {
    setOpen(false);
    callback();
  }, []);

  const handleResultSelect = useCallback((result: SearchResult) => {
    addRecentSearch(inputValue);
    void logClick(result.entity_type, result.entity_id);
    setOpen(false);
    navigate(result.deep_link);
  }, [inputValue, navigate]);

  const handleRecentSelect = useCallback((q: string) => {
    setInputValue(q);
    performSearch(q);
  }, [performSearch]);

  // ── Group results by entity type ───────────────────────────────────────────
  const grouped = searchResults.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.entity_type]) acc[r.entity_type] = [];
    acc[r.entity_type].push(r);
    return acc;
  }, {});

  const isLiveSearch = inputValue.trim().length >= 2;

  // ── Static nav items ───────────────────────────────────────────────────────
  const mainPages = [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', shortcut: '⌘D' },
    { label: 'Schedule', icon: Calendar, path: '/schedule', shortcut: '⌘S' },
    { label: 'Time Tracking', icon: Clock, path: '/time-tracking', shortcut: '⌘T' },
    { label: 'Employees', icon: Users, path: '/employees', shortcut: '⌘E' },
    { label: 'Clients', icon: UserCircle, path: '/clients', shortcut: '⌘C' },
    { label: 'Invoices', icon: FileText, path: '/invoices', shortcut: '⌘I' },
    { label: 'Reports', icon: ClipboardCheck, path: '/reports', shortcut: '⌘R' },
    { label: 'Analytics', icon: BarChart3, path: '/analytics', shortcut: '⌘A' },
    { label: 'Settings', icon: Settings, path: '/settings', shortcut: '⌘,' },
  ];

  const quickActions = [
    { label: 'Clock In/Out', icon: Clock, path: '/time-tracking' },
    { label: 'Create Shift', icon: Calendar, path: '/schedule' },
    { label: 'Add Employee', icon: Users, path: '/employees' },
    { label: 'Add Client', icon: UserCircle, path: '/clients' },
    { label: 'Generate Invoice', icon: DollarSign, path: '/invoices' },
  ];

  const helpResources = [
    { label: 'Help Center', icon: HelpCircle, path: '/support' },
    { label: 'Live Chat Support', icon: MessageSquare, path: '/chatrooms' },
    { label: 'Contact Support', icon: Mail, path: '/contact' },
    { label: 'Login Guide', icon: FileText, action: () => window.open('/docs/LOGIN_GUIDE.md', '_blank') },
    { label: 'Feature Showcase', icon: Zap, action: () => window.open('/docs/FEATURES_SHOWCASE.md', '_blank') },
    { label: 'Security Docs', icon: Shield, action: () => window.open('/docs/SECURITY.md', '_blank') },
  ];

  const adminPages = [
    { label: 'Usage & Credits', icon: Activity, path: '/admin/usage' },
  ];

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      {/* ARIA live region — announces search result count to screen readers */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        role="status"
      >
        {isLiveSearch && !isSearching && (
          searchTotal > 0
            ? `Found ${searchTotal} result${searchTotal !== 1 ? 's' : ''} for ${inputValue}`
            : `No results found for ${inputValue}`
        )}
        {isLiveSearch && isSearching && 'Searching…'}
      </div>

      {/* Result count header */}
      {isLiveSearch && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b text-xs text-muted-foreground">
          {isSearching ? (
            <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> <span>Searching…</span></span>
          ) : (
            <span data-testid="search-result-count">
              {searchTotal > 0 ? `${searchTotal} result${searchTotal !== 1 ? 's' : ''} for "${inputValue}"` : `No results for "${inputValue}"`}
            </span>
          )}
        </div>
      )}

      <CommandInput
        placeholder="Search anything or type a command…"
        value={inputValue}
        onValueChange={handleInputChange}
        data-testid="input-command-palette"
      />

      <CommandList>
        {/* ── LIVE SEARCH RESULTS ─────────────────────────────────────────── */}
        {isLiveSearch ? (
          <>
            {!isSearching && searchResults.length === 0 && (
              <CommandEmpty data-testid="search-empty-state">
                No results for &ldquo;{inputValue}&rdquo; — try a different term
              </CommandEmpty>
            )}

            {Object.entries(grouped).map(([entityType, results]) => {
              const Icon = ENTITY_ICONS[entityType] ?? Search;
              const label = ENTITY_LABELS[entityType] ?? entityType;
              return (
                <CommandGroup key={entityType} heading={label}>
                  {results.slice(0, 5).map(result => (
                    <CommandItem
                      key={result.entity_id}
                      value={`${entityType}-${result.entity_id}-${result.display_name}`}
                      onSelect={() => handleResultSelect(result)}
                      data-testid={`search-result-${entityType}-${result.entity_id}`}
                      className="flex flex-col items-start gap-0.5 py-2"
                    >
                      <div className="flex items-center gap-2 w-full">
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="font-medium truncate">{result.display_name}</span>
                        <Badge variant="outline" className="ml-auto shrink-0 text-xs">
                          {label.slice(0, -1)}
                        </Badge>
                      </div>
                      {result.subtitle && (
                        <p className="text-xs text-muted-foreground pl-6 truncate w-full">{result.subtitle}</p>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </>
        ) : (
          /* ── STATIC NAV + RECENT SEARCHES ─────────────────────────────── */
          <>
            {/* Recent searches */}
            {recentSearches.length > 0 && (
              <>
                <CommandGroup heading="Recent Searches">
                  {recentSearches.slice(0, 5).map((q, i) => (
                    <CommandItem
                      key={i}
                      value={`recent-${q}`}
                      onSelect={() => handleRecentSelect(q)}
                      data-testid={`recent-search-${i}`}
                    >
                      <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                      <span>{q}</span>
                    </CommandItem>
                  ))}
                  <CommandItem
                    value="clear-recent-searches"
                    onSelect={() => { clearRecentSearches(); setRecentSearches([]); }}
                    data-testid="button-clear-recent-searches"
                    className="text-muted-foreground"
                  >
                    <X className="mr-2 h-3 w-3" />
                    <span className="text-xs">Clear recent searches</span>
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            <CommandGroup heading="Navigation">
              {mainPages.map((page) => (
                <CommandItem
                  key={page.path}
                  value={page.label}
                  onSelect={() => handleSelect(() => navigate(page.path))}
                  data-testid={`command-${page.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <page.icon className="mr-2 h-4 w-4" />
                  <span>{page.label}</span>
                  {page.shortcut && (
                    <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                      {page.shortcut}
                    </kbd>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Admin">
              {adminPages.map((page) => (
                <CommandItem
                  key={page.path}
                  value={page.label}
                  onSelect={() => handleSelect(() => navigate(page.path))}
                  data-testid={`command-${page.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <page.icon className="mr-2 h-4 w-4" />
                  <span>{page.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Quick Actions">
              {quickActions.map((item, index) => (
                <CommandItem
                  key={index}
                  value={`action-${item.label}`}
                  onSelect={() => handleSelect(() => navigate(item.path))}
                  data-testid={`command-action-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  <span>{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Help & Resources">
              {helpResources.map((resource, index) => (
                <CommandItem
                  key={index}
                  value={`help-${resource.label}`}
                  onSelect={() => handleSelect(resource.action ? resource.action : () => navigate(resource.path!))}
                  data-testid={`command-help-${resource.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <resource.icon className="mr-2 h-4 w-4" />
                  <span>{resource.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Account">
              <CommandItem
                value="logout"
                onSelect={() => handleSelect(() => performLogout())}
                data-testid="command-logout"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log Out</span>
                <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                  ⌘Q
                </kbd>
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
