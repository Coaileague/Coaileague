import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UniversalEmptyState } from "@/components/universal";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle } from "@/components/ui/universal-modal";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CreditCard,
  Shield,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  QrCode,
  FileCheck,
  Calendar,
  Building2,
  Wallet,
} from "lucide-react";

interface Credential {
  id: string;
  certificationType: string;
  certificationName: string;
  certificationNumber: string | null;
  issuingAuthority: string | null;
  issuedDate: string | null;
  expirationDate: string | null;
  status: string;
  documentUrl: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  isRequired: boolean;
  notes: string | null;
}

interface CredentialSummary {
  total: number;
  verified: number;
  pending: number;
  expired: number;
  expiringSoon: number;
}

interface ExpiringItem {
  cert: Credential;
  employee: { firstName: string; lastName: string } | null;
}

function getDaysUntilExpiry(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getStatusBadge(credential: Credential) {
  const days = getDaysUntilExpiry(credential.expirationDate);
  const isExpired = days !== null && days < 0;

  if (isExpired || credential.status === "expired") {
    return <Badge variant="destructive" data-testid={`badge-status-${credential.id}`}><XCircle className="h-3 w-3 mr-1" />Expired</Badge>;
  }
  if (credential.status === "verified") {
    if (days !== null && days <= 30) {
      return <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 border-amber-200" data-testid={`badge-status-${credential.id}`}><AlertTriangle className="h-3 w-3 mr-1" />Expiring Soon</Badge>;
    }
    return <Badge variant="default" data-testid={`badge-status-${credential.id}`}><CheckCircle2 className="h-3 w-3 mr-1" />Verified</Badge>;
  }
  if (credential.status === "invalid") {
    return <Badge variant="destructive" data-testid={`badge-status-${credential.id}`}><XCircle className="h-3 w-3 mr-1" />Invalid</Badge>;
  }
  return <Badge variant="secondary" data-testid={`badge-status-${credential.id}`}><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
}

function getTypeIcon(type: string) {
  switch (type) {
    case "driver_license": return CreditCard;
    case "guard_card":
    case "security_license": return Shield;
    case "medical_cert":
    case "cpr":
    case "first_aid": return FileCheck;
    default: return FileCheck;
  }
}

function formatType(type: string) {
  return type.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function CredentialCard({ credential, onShowQR }: { credential: Credential; onShowQR: (c: Credential) => void }) {
  const days = getDaysUntilExpiry(credential.expirationDate);
  const Icon = getTypeIcon(credential.certificationType);

  return (
    <Card className="hover-elevate" data-testid={`credential-card-${credential.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-medium truncate" data-testid={`text-cred-name-${credential.id}`}>
                {credential.certificationName}
              </p>
              <p className="text-sm text-muted-foreground truncate">
                {formatType(credential.certificationType)}
              </p>
              {credential.certificationNumber && (
                <p className="text-xs text-muted-foreground mt-1 font-mono" data-testid={`text-cred-number-${credential.id}`}>
                  #{credential.certificationNumber}
                </p>
              )}
            </div>
          </div>
          {getStatusBadge(credential)}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          {credential.issuingAuthority && (
            <div className="flex items-center gap-1">
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{credential.issuingAuthority}</span>
            </div>
          )}
          {credential.expirationDate && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3 shrink-0" />
              <span className={days !== null && days <= 30 ? "text-amber-600 font-medium" : ""}>
                {days !== null && days < 0
                  ? `Expired ${Math.abs(days)}d ago`
                  : days !== null
                    ? `${days}d remaining`
                    : new Date(credential.expirationDate).toLocaleDateString()
                }
              </span>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {credential.status === "verified" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onShowQR(credential)}
              data-testid={`btn-qr-${credential.id}`}
            >
              <QrCode className="h-3 w-3 mr-1" />
              QR Code
            </Button>
          )}
          {credential.isRequired && (
            <Badge variant="outline" className="text-xs">Required</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function QRDialog({ credential, open, onClose }: { credential: Credential | null; open: boolean; onClose: () => void }) {
  if (!credential) return null;

  const verifyUrl = `${window.location.origin}/api/credentials/verify/${credential.id}`;
  const qrData = encodeURIComponent(verifyUrl);
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrData}`;

  return (
    <UniversalModal open={open} onOpenChange={onClose} className="sm:max-w-md">
        <UniversalModalHeader>
          <UniversalModalTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Verification QR Code
          </UniversalModalTitle>
        </UniversalModalHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="bg-white p-4 rounded-md">
            <img
              src={qrImageUrl}
              alt="Verification QR Code"
              className="w-48 h-48"
              data-testid="img-qr-code"
            />
          </div>
          <div className="text-center space-y-1">
            <p className="font-medium" data-testid="text-qr-cred-name">{credential.certificationName}</p>
            {credential.certificationNumber && (
              <p className="text-sm text-muted-foreground font-mono">#{credential.certificationNumber}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Scan to verify this credential
            </p>
          </div>
          <Badge variant={credential.status === "verified" ? "default" : "secondary"}>
            {credential.status === "verified" ? "Verified" : credential.status}
          </Badge>
        </div>
    </UniversalModal>
  );
}

const pageConfig: CanvasPageConfig = {
  title: "Credential Wallet",
  subtitle: "Your digital licenses, certifications, and guard credentials",
  // @ts-expect-error — TS migration: fix in refactoring sprint
  icon: Wallet,
};

export default function CredentialWalletPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [qrCredential, setQrCredential] = useState<Credential | null>(null);

  const { data: walletData, isLoading: walletLoading } = useQuery<{ credentials: Credential[]; employee: any }>({
    queryKey: ["/api/credentials/wallet"],
  });

  const { data: summaryData } = useQuery<CredentialSummary>({
    queryKey: ["/api/credentials/summary"],
  });

  const { data: expiringData } = useQuery<{ critical: ExpiringItem[]; warning: ExpiringItem[]; total: number }>({
    queryKey: ["/api/credentials/expiring"],
  });

  const credentials = walletData?.credentials || [];
  const summary = summaryData || { total: 0, verified: 0, pending: 0, expired: 0, expiringSoon: 0 };

  const activeCredentials = credentials.filter(c => {
    const days = getDaysUntilExpiry(c.expirationDate);
    return c.status === "verified" && (days === null || days > 0);
  });

  const expiringCredentials = credentials.filter(c => {
    const days = getDaysUntilExpiry(c.expirationDate);
    return days !== null && days >= 0 && days <= 30;
  });

  const expiredCredentials = credentials.filter(c => {
    const days = getDaysUntilExpiry(c.expirationDate);
    return c.status === "expired" || (days !== null && days < 0);
  });

  const pendingCredentials = credentials.filter(c => c.status === "pending");

  const getFilteredCredentials = () => {
    switch (activeTab) {
      case "active": return activeCredentials;
      case "expiring": return expiringCredentials;
      case "expired": return expiredCredentials;
      case "pending": return pendingCredentials;
      default: return credentials;
    }
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6" data-testid="credential-wallet">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card data-testid="stat-active">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold text-green-600" data-testid="text-active-count">{summary.verified}</div>
              <p className="text-xs text-muted-foreground">Verified credentials</p>
            </CardContent>
          </Card>

          <Card data-testid="stat-expiring">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold text-amber-600" data-testid="text-expiring-count">{summary.expiringSoon}</div>
              <p className="text-xs text-muted-foreground">Within 30 days</p>
            </CardContent>
          </Card>

          <Card data-testid="stat-expired">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Expired</CardTitle>
              <XCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold text-destructive" data-testid="text-expired-count">{summary.expired}</div>
              <p className="text-xs text-muted-foreground">Need renewal</p>
            </CardContent>
          </Card>

          <Card data-testid="stat-pending">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold" data-testid="text-pending-count">{summary.pending}</div>
              <p className="text-xs text-muted-foreground">Awaiting verification</p>
            </CardContent>
          </Card>
        </div>

        {expiringData && expiringData.critical.length > 0 && (
          <Card className="border-amber-200 dark:border-amber-800" data-testid="alert-expiring-critical">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Credentials Expiring Within 30 Days
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {expiringData.critical.map((item) => {
                  const days = getDaysUntilExpiry(item.cert.expirationDate);
                  return (
                    <div key={item.cert.id} className="flex items-center justify-between gap-2 text-sm p-2 rounded-md bg-amber-50 dark:bg-amber-950/20">
                      <div className="flex items-center gap-2 min-w-0">
                        <Shield className="h-4 w-4 text-amber-600 shrink-0" />
                        <span className="truncate font-medium">{item.cert.certificationName}</span>
                        {item.employee && (
                          <span className="text-muted-foreground truncate">
                            - {item.employee.firstName} {item.employee.lastName}
                          </span>
                        )}
                      </div>
                      <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 shrink-0">
                        {days}d left
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-flex">
            <TabsTrigger value="all" data-testid="tab-all">
              All ({credentials.length})
            </TabsTrigger>
            <TabsTrigger value="active" data-testid="tab-active">
              Active ({activeCredentials.length})
            </TabsTrigger>
            <TabsTrigger value="expiring" data-testid="tab-expiring">
              Expiring ({expiringCredentials.length})
            </TabsTrigger>
            <TabsTrigger value="expired" data-testid="tab-expired">
              Expired ({expiredCredentials.length})
            </TabsTrigger>
            <TabsTrigger value="pending" data-testid="tab-pending">
              Pending ({pendingCredentials.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            {walletLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                  <Card key={i}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <Skeleton className="h-10 w-10 rounded-md" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                      <Skeleton className="h-3 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : getFilteredCredentials().length === 0 ? (
              <UniversalEmptyState
                icon={<Wallet size={32} />}
                title={activeTab === "all" ? "No Credentials Found" : `No ${activeTab} Credentials`}
                description="Credentials added through compliance and onboarding will appear here"
                data-testid="text-empty-state"
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {getFilteredCredentials().map(cred => (
                  <CredentialCard
                    key={cred.id}
                    credential={cred}
                    onShowQR={setQrCredential}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <QRDialog
          credential={qrCredential}
          open={!!qrCredential}
          onClose={() => setQrCredential(null)}
        />
      </div>
    </CanvasHubPage>
  );
}
