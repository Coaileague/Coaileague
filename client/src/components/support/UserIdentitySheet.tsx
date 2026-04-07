/**
 * UserIdentitySheet
 *
 * A sheet/drawer that support agents open via right-click or long-press on any
 * user reference in the support interface. Shows everything the agent needs to
 * identify, verify, and assist the user or org.
 *
 * Usage:
 *   <UserIdentitySheet query="user@email.com" trigger={<span>User name</span>} />
 *   <UserIdentitySheet query="EMP-ACME-00001" trigger={<Badge>EMP-ACME-00001</Badge>} />
 */

import { useState, useRef, useCallback, type ReactNode } from "react";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalDescription, UniversalModalContent } from '@/components/ui/universal-modal';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "@tanstack/react-query";
import {
  User, Building2, CreditCard, Shield, Mail, Phone,
  Key, Star, Clock, Copy, CheckCircle, AlertCircle,
  Search, Loader2, LifeBuoy, Lock, Globe, ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ============================================================================
// TYPES (must match FullIdentityRecord from identityService.ts)
// ============================================================================

interface FullIdentityRecord {
  userId?: string;
  email?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  profileImageUrl?: string;
  externalId?: string;
  employeeNumber?: string;
  workId?: string;
  supportCode?: string;
  safetyCode?: string;
  emailVerified?: boolean;
  lastLoginAt?: string;
  loginAttempts?: number;
  mfaEnabled?: boolean;
  accountLocked?: boolean;
  workspaceId?: string;
  workspaceName?: string;
  orgCode?: string;
  orgExternalId?: string;
  subscriptionTier?: string;
  subscriptionStatus?: string;
  workspaceRole?: string;
  isSuspended?: boolean;
  isFrozen?: boolean;
  platformRole?: string;
  employeeId?: string;
  position?: string;
  department?: string;
  hireDate?: string;
  isActive?: boolean;
  creditBalance?: number;
  monthlyAllocation?: number;
  autoRechargeEnabled?: boolean;
  recentHelpAISessions?: {
    id: string;
    ticketNumber: string;
    state: string;
    createdAt: string;
    wasEscalated: boolean;
  }[];
  allWorkspaces?: { workspaceId: string; workspaceName: string; role: string }[];
}

// ============================================================================
// COPY HELPER
// ============================================================================

function CopyValue({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      toast({ title: `Copied ${label || 'value'}` });
      setTimeout(() => setCopied(false), 1500);
    }).catch((err) => {
      console.error('Clipboard copy failed:', err);
      toast({
        title: "Copy failed",
        description: "Please copy manually.",
        variant: "destructive"
      });
    });
  };

  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1 text-xs font-mono bg-muted/60 rounded px-1.5 py-0.5 hover-elevate max-w-[200px] truncate"
      title={`Copy ${value}`}
      data-testid={`copy-${label?.toLowerCase().replace(/\s/g, '-')}`}
    >
      <span className="truncate">{value}</span>
      {copied ? <CheckCircle className="h-3 w-3 text-green-500 shrink-0" /> : <Copy className="h-3 w-3 text-muted-foreground shrink-0" />}
    </button>
  );
}

// ============================================================================
// IDENTITY DETAIL PANEL
// ============================================================================

function IdentityDetail({ record }: { record: FullIdentityRecord }) {
  const tierColors: Record<string, string> = {
    free: 'bg-muted text-muted-foreground',
    starter: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
    professional: 'bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300',
    enterprise: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
  };

  return (
    <ScrollArea className="h-[calc(100vh-120px)]">
      <div className="space-y-4 pb-8 pr-1">

        {/* ── USER IDENTITY ───────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4" /> User Identity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Name" value={record.displayName} />
            <Row label="Email">
              <div className="flex items-center gap-2">
                {record.email && <CopyValue value={record.email} label="Email" />}
                {record.emailVerified
                  ? <Badge variant="secondary" className="text-xs">verified</Badge>
                  : <Badge variant="destructive" className="text-xs">unverified</Badge>}
              </div>
            </Row>
            <Row label="User UUID">{record.userId && <CopyValue value={record.userId} label="User UUID" />}</Row>
            <Row label="External ID">{record.externalId && <CopyValue value={record.externalId} label="External ID" />}</Row>
            <Row label="Work ID">{record.workId && <CopyValue value={record.workId} label="Work ID" />}</Row>
            <Row label="Phone" value={record.phone} />
            <Row label="MFA">{record.mfaEnabled ? <Badge variant="secondary" className="text-xs">enabled</Badge> : <Badge variant="outline" className="text-xs">off</Badge>}</Row>
            <Row label="Last Login" value={record.lastLoginAt ? new Date(record.lastLoginAt).toLocaleString() : undefined} />
            {(record.accountLocked || (record.loginAttempts ?? 0) >= 3) && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 mt-1">
                <Lock className="h-3.5 w-3.5 text-destructive" />
                <span className="text-xs text-destructive">
                  {record.accountLocked ? 'Account locked' : `${record.loginAttempts} failed login attempts`}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── SAFETY CODE ─────────────────────────────── */}
        {record.supportCode && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Key className="h-4 w-4" /> Safety / Support Code
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-2">
                This code verifies the user's identity during support sessions. Ask them to provide it.
              </p>
              <CopyValue value={record.supportCode} label="Safety Code" />
            </CardContent>
          </Card>
        )}

        {/* ── PLATFORM ROLE ───────────────────────────── */}
        {record.platformRole && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4" /> Platform Role
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="capitalize">{record.platformRole.replace(/_/g, ' ')}</Badge>
            </CardContent>
          </Card>
        )}

        {/* ── ORGANIZATION ────────────────────────────── */}
        {record.workspaceId && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Organization
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Org Name" value={record.workspaceName} />
              <Row label="Org UUID">{record.workspaceId && <CopyValue value={record.workspaceId} label="Org UUID" />}</Row>
              <Row label="Org Code">{record.orgCode && <CopyValue value={record.orgCode} label="Org Code" />}</Row>
              <Row label="Org External ID">{record.orgExternalId && <CopyValue value={record.orgExternalId} label="Org External ID" />}</Row>
              <Row label="Role">
                {record.workspaceRole && <Badge variant="outline" className="text-xs capitalize">{record.workspaceRole.replace(/_/g, ' ')}</Badge>}
              </Row>
              <Row label="Tier">
                <Badge className={`text-xs ${tierColors[record.subscriptionTier || 'free'] || ''}`}>
                  {record.subscriptionTier || 'free'}
                </Badge>
              </Row>
              <Row label="Status">
                {record.isSuspended
                  ? <Badge variant="destructive" className="text-xs">suspended</Badge>
                  : record.isFrozen
                    ? <Badge variant="secondary" className="text-xs">frozen</Badge>
                    : <Badge variant="secondary" className="text-xs">active</Badge>
                }
              </Row>
            </CardContent>
          </Card>
        )}

        {/* ── EMPLOYEE INFO ───────────────────────────── */}
        {record.employeeId && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Star className="h-4 w-4" /> Employee Record
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Employee ID">{record.employeeNumber && <CopyValue value={record.employeeNumber} label="Employee Number" />}</Row>
              <Row label="Position" value={record.position} />
              <Row label="Department" value={record.department} />
              <Row label="Hire Date" value={record.hireDate ? new Date(record.hireDate).toLocaleDateString() : undefined} />
              <Row label="Status">
                {record.isActive
                  ? <Badge variant="secondary" className="text-xs">active</Badge>
                  : <Badge variant="destructive" className="text-xs">inactive</Badge>}
              </Row>
            </CardContent>
          </Card>
        )}

        {/* ── CREDITS ─────────────────────────────────── */}
        {record.creditBalance !== undefined && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Credits
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Balance">
                <span className={record.creditBalance < 50 ? 'text-destructive font-semibold' : 'font-semibold'}>
                  {record.creditBalance.toLocaleString()}
                </span>
              </Row>
              {record.monthlyAllocation && (
                <Row label="Monthly Alloc" value={record.monthlyAllocation.toLocaleString()} />
              )}
              <Row label="Auto-Recharge">
                {record.autoRechargeEnabled
                  ? <Badge variant="secondary" className="text-xs">on</Badge>
                  : <Badge variant="outline" className="text-xs">off</Badge>}
              </Row>
            </CardContent>
          </Card>
        )}

        {/* ── RECENT HELPAI SESSIONS ───────────────────── */}
        {record.recentHelpAISessions && record.recentHelpAISessions.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <LifeBuoy className="h-4 w-4" /> Recent Support Sessions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {record.recentHelpAISessions.map(s => (
                <div key={s.id} className="flex items-center justify-between gap-2 text-xs py-1 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-muted-foreground">{s.ticketNumber || s.id.slice(0, 8)}</span>
                    <Badge variant={s.state === 'disconnected' || s.state === 'resolved' ? 'secondary' : 'outline'} className="text-xs">
                      {s.state}
                    </Badge>
                    {s.wasEscalated && <Badge variant="destructive" className="text-xs">escalated</Badge>}
                  </div>
                  <span className="text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ── ALL WORKSPACES ───────────────────────────── */}
        {record.allWorkspaces && record.allWorkspaces.length > 1 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Globe className="h-4 w-4" /> All Organizations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {record.allWorkspaces.map(w => (
                <div key={w.workspaceId} className="flex items-center justify-between gap-2 text-xs py-1">
                  <span className="truncate">{w.workspaceName}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-xs">{w.role}</Badge>
                    <CopyValue value={w.workspaceId} label="Workspace ID" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}

function Row({ label, value, children }: { label: string; value?: string | number; children?: ReactNode }) {
  if (!value && !children) return null;
  return (
    <div className="flex items-start justify-between gap-3 py-0.5">
      <span className="text-muted-foreground text-xs shrink-0 pt-0.5">{label}</span>
      <div className="text-right">
        {children || <span className="text-xs">{value}</span>}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface UserIdentitySheetProps {
  /** Initial query (email, UUID, external ID, work ID) — can be overridden by search */
  query?: string;
  /** The element that triggers the sheet on right-click / long-press */
  trigger: ReactNode;
  /** If true, always show a search bar even if a query is provided */
  showSearch?: boolean;
  /** className for the trigger wrapper */
  className?: string;
}

export function UserIdentitySheet({ query: initialQuery, trigger, showSearch, className }: UserIdentitySheetProps) {
  const [open, setOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(initialQuery || '');
  const [activeQuery, setActiveQuery] = useState(initialQuery || '');
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  const { data, isLoading, isFetching } = useQuery<{ success: boolean; results: FullIdentityRecord[] }>({
    queryKey: ['/api/billing/upsell/identity-lookup', activeQuery],
    enabled: open && activeQuery.length >= 2,
  });

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setOpen(true);
  }, []);

  const handleTouchStart = useCallback(() => {
    longPressTimer.current = setTimeout(() => {
      setOpen(true);
    }, 600);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleSearch = () => {
    if (searchInput.trim().length < 2) {
      toast({ title: 'Enter at least 2 characters to search', variant: 'destructive' });
      return;
    }
    setActiveQuery(searchInput.trim());
  };

  const results = data?.results || [];

  return (
    <>
      {/* Trigger wrapper */}
      <span
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className={`cursor-context-menu select-none ${className || ''}`}
        title="Right-click or long-press to look up identity"
        data-testid="identity-trigger"
      >
        {trigger}
      </span>

      {/* Sheet */}
      <UniversalModal open={open} onOpenChange={setOpen}>
        <UniversalModalContent side="right" className="w-full sm:max-w-lg">
          <UniversalModalHeader>
            <UniversalModalTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Identity Lookup
            </UniversalModalTitle>
            <UniversalModalDescription>
              Support agent identity verification. Right-click any user reference to look them up.
            </UniversalModalDescription>
          </UniversalModalHeader>

          {/* Search bar */}
          <div className="flex gap-2 mt-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Email, UUID, EMP-XXXX, Work ID…"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                data-testid="input-identity-search"
              />
            </div>
            <Button size="default" onClick={handleSearch} data-testid="button-identity-search">
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {/* Results */}
          {isLoading || isFetching ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : activeQuery.length < 2 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
              <Search className="h-8 w-8" />
              <p className="text-sm text-center">Enter an email, UUID, external ID, or work ID to look up a user</p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
              <AlertCircle className="h-8 w-8" />
              <p className="text-sm">No results found for "{activeQuery}"</p>
            </div>
          ) : results.length === 1 ? (
            <IdentityDetail record={results[0]} />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{results.length} results found</p>
              {results.map((r, i) => (
                <Card key={i} className="cursor-pointer hover-elevate" data-testid={`identity-result-${i}`}>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{r.displayName || r.email}</p>
                        <p className="text-xs text-muted-foreground">{r.email} · {r.workspaceName || r.workspaceId}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">{r.subscriptionTier || 'free'}</Badge>
                    </div>
                    <Separator className="my-2" />
                    <IdentityDetail record={r} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </UniversalModalContent>
      </UniversalModal>
    </>
  );
}

/**
 * Standalone search-only version for use in support dashboards.
 * No trigger element — always shows the sheet with a search bar.
 */
export function IdentityLookupPanel({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <UserIdentitySheet
      query=""
      showSearch
      trigger={
        <Button variant="outline" size="sm" data-testid="button-open-identity-lookup">
          <Shield className="h-4 w-4 mr-1" />
          Identity Lookup
        </Button>
      }
    />
  );
}
