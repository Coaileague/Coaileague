import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CanvasHubPage } from "@/components/canvas-hub";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Download,
  FileText,
  Search,
  Shield,
  Users,
  XCircle,
  AlertTriangle,
  FileCheck,
  User,
  CreditCard,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { format } from "date-fns";

// ── Types ──────────────────────────────────────────────────────────────────────

interface DocCompleteness {
  present: boolean;
  doc?: {
    id: string;
    documentType: string;
    documentName: string;
    documentDescription?: string;
    fileUrl: string;
    fileType?: string;
    status?: string;
    uploadedAt?: string;
    isVerified?: boolean;
    verifiedBy?: string;
    verifiedAt?: string;
    expirationDate?: string;
  } | null;
}

interface StaffPacket {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  workerType: string;
  status: string;
  position: string;
  guardCardVerified: boolean;
  hireDate?: string;
  documents: any[];
  completeness: Record<string, DocCompleteness>;
  completedCount: number;
  totalRequired: number;
  completenessPercent: number;
}

interface SpsContract {
  id: string;
  documentNumber: string;
  documentType: string;
  status: string;
  recipientName: string;
  clientCompanyName?: string;
  serviceType?: string;
  contractTerm?: string;
  officersRequired?: number;
  ratePrimary?: string;
  completedAt?: string;
  createdAt: string;
}

const REGULATORY_KEYS = [
  { key: "application",     label: "Application",     icon: FileText },
  { key: "idCopy",          label: "DL / ID",         icon: CreditCard },
  { key: "ssnCard",         label: "SSN Card",        icon: Lock },
  { key: "i9",              label: "I-9",             icon: FileCheck },
  { key: "taxForm",         label: "W-4 / W-9",       icon: FileText },
  { key: "drugFree",        label: "Drug-Free",       icon: Shield },
  { key: "backgroundCheck", label: "Bg Check",        icon: CheckCircle2 },
  { key: "guardCard",       label: "Guard Card",      icon: Shield },
];

const COMPANY_DOC_SLOTS = [
  { key: "state_security_license",  label: "State Security Company License",     required: true },
  { key: "business_license",        label: "Business License / Permit",          required: true },
  { key: "general_liability",       label: "General Liability Insurance Cert",   required: true },
  { key: "workers_comp",            label: "Workers' Comp Certificate",          required: true },
  { key: "employer_id",             label: "Federal EIN / Tax ID Documentation", required: true },
  { key: "labor_law_poster",        label: "State Labor Law Posting",            required: false },
  { key: "surety_bond",             label: "Surety Bond Certificate",            required: false },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function statusColor(status: string) {
  const m: Record<string, string> = {
    completed: "bg-green-500", signed: "bg-green-500", active: "bg-green-500",
    sent: "bg-blue-500", viewed: "bg-yellow-500",
    draft: "bg-slate-500", voided: "bg-red-500", expired: "bg-orange-500",
  };
  return m[status] ?? "bg-slate-500";
}

function workerLabel(type: string) {
  return type === "1099" || type === "contractor" ? "Contractor" : "Employee";
}

function DocDot({ present, label }: { present: boolean; label: string }) {
  return (
    <span
      title={label}
      className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${
        present ? "bg-green-400" : "bg-destructive/40"
      }`}
    />
  );
}

// ── Company Tab ────────────────────────────────────────────────────────────────

function CompanyTab() {
  const { data, isLoading } = useQuery<{ success: boolean; data: any }>({
    queryKey: ["/api/sps/company-docs"],
  });
  const [contractFilter, setContractFilter] = useState("all");

  const company = data?.data;
  const allContracts: SpsContract[] = company?.contracts ?? [];
  const contracts = allContracts.filter(c =>
    contractFilter === "all" || c.documentType === contractFilter
  );

  const credSlots = COMPANY_DOC_SLOTS.map(slot => ({
    ...slot,
    uploaded: (company?.companyDocs ?? []).some(
      (d: any) =>
        d.documentType === slot.key ||
        d.documentName?.toLowerCase().includes(slot.label.toLowerCase().substring(0, 12))
    ),
  }));

  const credScore = credSlots.length
    ? Math.round((credSlots.filter(s => s.uploaded).length / credSlots.length) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Organizational Credentials
          </CardTitle>
          <Badge className={credScore === 100 ? "bg-green-500" : "bg-amber-500"}>
            {credScore}% Complete
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {credSlots.map(slot => (
              <div
                key={slot.key}
                data-testid={`slot-${slot.key}`}
                className={`flex items-center justify-between rounded-md border p-3 gap-3 ${
                  slot.uploaded
                    ? "border-green-500/30 bg-green-500/5"
                    : "border-border bg-muted/30"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {slot.uploaded ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  ) : slot.required ? (
                    <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{slot.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {slot.required ? "Required" : "Recommended"}
                    </p>
                  </div>
                </div>
                {slot.uploaded ? (
                  <Badge className="bg-green-500 text-xs shrink-0">On File</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground shrink-0">
                    Missing
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Contracts &amp; Proposals
          </CardTitle>
          <Select value={contractFilter} onValueChange={setContractFilter}>
            <SelectTrigger className="w-36" data-testid="select-contract-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="client_contract">Contracts</SelectItem>
              <SelectItem value="proposal">Proposals</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : contracts.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No contracts or proposals on file.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Doc #</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map(c => (
                  <TableRow key={c.id} data-testid={`row-contract-${c.id}`}>
                    <TableCell className="font-mono text-xs">{c.documentNumber}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize text-xs">
                        {c.documentType === "client_contract" ? "Contract" : "Proposal"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.clientCompanyName ?? c.recipientName}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${statusColor(c.status)} text-white text-xs`}>
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(c.completedAt ?? c.createdAt), "MMM d, yyyy")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Staff Tab ──────────────────────────────────────────────────────────────────

function StaffTab() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ success: boolean; data: StaffPacket[] }>({
    queryKey: ["/api/sps/staff-packets"],
  });

  const all = data?.data ?? [];
  const filtered = all.filter(p => {
    const name = `${p.firstName} ${p.lastName}`.toLowerCase();
    const matchSearch =
      name.includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase());
    const matchType =
      typeFilter === "all" ||
      (typeFilter === "employee" &&
        p.workerType !== "1099" &&
        p.workerType !== "contractor") ||
      (typeFilter === "contractor" &&
        (p.workerType === "1099" || p.workerType === "contractor"));
    return matchSearch && matchType;
  });

  const selected = all.find(p => p.id === selectedId);

  const selectedDocIds = new Set(
    REGULATORY_KEYS.map(({ key }) => (selected?.completeness[key]?.doc as any)?.id).filter(Boolean)
  );

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search staff..."
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-search-staff"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36" data-testid="select-staff-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Staff</SelectItem>
              <SelectItem value="employee">Employees</SelectItem>
              <SelectItem value="contractor">Contractors</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading staff packets...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No staff found.</p>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Type</TableHead>
                  <TableHead className="hidden md:table-cell">Position</TableHead>
                  <TableHead>Documents</TableHead>
                  <TableHead>Complete</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => (
                  <TableRow
                    key={p.id}
                    data-testid={`row-staff-${p.id}`}
                    className="cursor-pointer hover-elevate"
                    onClick={() => setSelectedId(p.id)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold flex-shrink-0">
                          {p.firstName[0]}{p.lastName[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {p.firstName} {p.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground hidden sm:block truncate">
                            {p.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="outline" className="text-xs">
                        {workerLabel(p.workerType)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {p.position ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {REGULATORY_KEYS.map(({ key, label }) => (
                          <DocDot
                            key={key}
                            present={p.completeness[key]?.present ?? false}
                            label={label}
                          />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-[80px]">
                        <Progress value={p.completenessPercent} className="h-1.5 w-16" />
                        <span
                          className={`text-xs font-semibold tabular-nums ${
                            p.completenessPercent === 100
                              ? "text-green-500"
                              : p.completenessPercent >= 75
                              ? "text-blue-500"
                              : p.completenessPercent >= 50
                              ? "text-amber-500"
                              : "text-destructive"
                          }`}
                        >
                          {p.completenessPercent}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <Sheet open={!!selectedId} onOpenChange={() => setSelectedId(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {selected.firstName} {selected.lastName}
                </SheetTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">{workerLabel(selected.workerType)}</Badge>
                  <Badge
                    className={selected.status === "active" ? "bg-green-500" : "bg-slate-500"}
                  >
                    {selected.status}
                  </Badge>
                  {selected.position && (
                    <span className="text-sm text-muted-foreground">{selected.position}</span>
                  )}
                </div>
              </SheetHeader>

              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold">Packet Completeness</p>
                    <span className="text-sm font-bold text-primary">
                      {selected.completenessPercent}%
                    </span>
                  </div>
                  <Progress value={selected.completenessPercent} className="h-2" />
                </div>

                <div>
                  <p className="text-sm font-semibold mb-3">Required Documents</p>
                  <div className="grid grid-cols-1 gap-2">
                    {REGULATORY_KEYS.map(({ key, label }) => {
                      const entry = selected.completeness[key];
                      const present = entry?.present ?? false;
                      const doc = entry?.doc;
                      const downloadUrl = doc?.fileUrl
                        ? doc.fileUrl.replace("/view/", "/download/")
                        : null;
                      return (
                        <div
                          key={key}
                          data-testid={`packet-doc-${key}`}
                          className={`rounded-md border p-2.5 ${
                            present
                              ? "border-green-500/30 bg-green-500/5"
                              : "border-border bg-muted/20"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 min-w-0">
                              {present ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                              ) : (
                                <XCircle className="h-4 w-4 text-destructive/70 flex-shrink-0 mt-0.5" />
                              )}
                              <div className="min-w-0">
                                <p className="text-sm font-medium">{label}</p>
                                {doc ? (
                                  <>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {doc.documentDescription || doc.documentName}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                      {doc.uploadedAt && (
                                        <span className="text-xs text-muted-foreground">
                                          Signed {format(new Date(doc.uploadedAt), "MMM d, yyyy")}
                                        </span>
                                      )}
                                      {doc.isVerified && (
                                        <span className="flex items-center gap-0.5 text-xs text-green-600 font-medium">
                                          <ShieldCheck className="h-3 w-3" />
                                          {doc.verifiedBy ? `Verified by ${doc.verifiedBy}` : "Verified"}
                                        </span>
                                      )}
                                    </div>
                                  </>
                                ) : (
                                  <p className="text-xs text-muted-foreground">Not on file — pending</p>
                                )}
                              </div>
                            </div>
                            {doc?.fileUrl && (
                              <div className="flex items-center gap-1 shrink-0">
                                <a
                                  href={doc.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="View document"
                                  data-testid={`btn-view-doc-${key}`}
                                >
                                  <Button size="icon" variant="ghost">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </Button>
                                </a>
                                {downloadUrl && (
                                  <a
                                    href={downloadUrl}
                                    download
                                    title="Download document"
                                    data-testid={`btn-download-doc-${key}`}
                                  >
                                    <Button size="icon" variant="ghost">
                                      <Download className="h-3.5 w-3.5" />
                                    </Button>
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Additional docs not in the regulatory checklist */}
                {selected.documents.filter(d => !selectedDocIds.has(d.id)).length > 0 && (
                  <div>
                    <p className="text-sm font-semibold mb-3">Additional Documents</p>
                    <div className="space-y-1">
                      {selected.documents
                        .filter(d => !selectedDocIds.has(d.id))
                        .map((doc: any) => {
                          const dlUrl = doc.fileUrl
                            ? doc.fileUrl.replace("/view/", "/download/")
                            : null;
                          return (
                            <div
                              key={doc.id}
                              className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-sm truncate">{doc.documentName}</p>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-xs text-muted-foreground capitalize">
                                    {doc.documentType?.replace(/_/g, " ")}
                                  </p>
                                  {doc.uploadedAt && (
                                    <span className="text-xs text-muted-foreground">
                                      · {format(new Date(doc.uploadedAt), "MMM d, yyyy")}
                                    </span>
                                  )}
                                  {doc.isVerified && (
                                    <span className="flex items-center gap-0.5 text-xs text-green-600 font-medium">
                                      <ShieldCheck className="h-3 w-3" />
                                      Verified
                                    </span>
                                  )}
                                </div>
                              </div>
                              {doc.fileUrl && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <a
                                    href={doc.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="View"
                                  >
                                    <Button size="icon" variant="ghost">
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </Button>
                                  </a>
                                  {dlUrl && (
                                    <a href={dlUrl} download title="Download">
                                      <Button size="icon" variant="ghost">
                                        <Download className="h-3.5 w-3.5" />
                                      </Button>
                                    </a>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

// ── Reports Tab ────────────────────────────────────────────────────────────────

function ReportsTab() {
  const [clientFilter, setClientFilter] = useState("all");

  const { data, isLoading } = useQuery<{
    success: boolean;
    data: { reports: any[]; clients: string[] };
  }>({
    queryKey: ["/api/sps/reports", clientFilter],
    queryFn: () =>
      fetch(
        `/api/sps/reports${clientFilter !== "all" ? `?client=${encodeURIComponent(clientFilter)}` : ""}`
      ).then(r => r.json()),
  });

  const reports = data?.data?.reports ?? [];
  const clients = data?.data?.clients ?? [];

  return (
    <div className="space-y-4">
      <Select value={clientFilter} onValueChange={setClientFilter}>
        <SelectTrigger className="w-56" data-testid="select-client-filter">
          <SelectValue placeholder="All Clients" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Clients</SelectItem>
          {clients.map(c => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading reports...</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No documents found for this filter.
        </p>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Doc #</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Client / End-User</TableHead>
                <TableHead className="hidden md:table-cell">Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map(r => (
                <TableRow key={r.id} data-testid={`row-report-${r.id}`}>
                  <TableCell className="font-mono text-xs">{r.documentNumber}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize text-xs">
                      {r.documentType?.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.clientCompanyName ?? r.recipientName}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                    {r.serviceLocation ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge className={`${statusColor(r.status)} text-white text-xs`}>
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(r.completedAt ?? r.createdAt), "MMM d, yyyy")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

// ── Auditor Tab ────────────────────────────────────────────────────────────────

function AuditorTab() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ success: boolean; data: StaffPacket[] }>({
    queryKey: ["/api/sps/staff-packets"],
  });

  const guards = (data?.data ?? []).filter(p => {
    const name = `${p.firstName} ${p.lastName}`.toLowerCase();
    return (
      name.includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase())
    );
  });

  const selected = guards.find(g => g.id === selectedId);

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 rounded-md border border-amber-500/30 bg-amber-500/5">
          <Shield className="h-4 w-4 text-amber-500 shrink-0" />
          <p className="text-sm text-muted-foreground">
            This view mirrors what state regulatory auditors see. Only required regulatory
            documents are shown per guard.
          </p>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search guards..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-search-auditor"
          />
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : guards.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No licensed guards found.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {guards.map(g => {
              const auditScore = Math.round(
                (REGULATORY_KEYS.filter(({ key }) => g.completeness[key]?.present).length /
                  REGULATORY_KEYS.length) *
                  100
              );
              return (
                <Card
                  key={g.id}
                  data-testid={`card-guard-${g.id}`}
                  className="cursor-pointer hover-elevate"
                  onClick={() => setSelectedId(g.id)}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold shrink-0">
                        {g.firstName[0]}{g.lastName[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {g.firstName} {g.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {g.position ?? "Guard"}
                        </p>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">Regulatory Package</span>
                        <span
                          className={`text-xs font-bold ${
                            auditScore === 100
                              ? "text-green-500"
                              : auditScore >= 75
                              ? "text-blue-500"
                              : auditScore >= 50
                              ? "text-amber-500"
                              : "text-destructive"
                          }`}
                        >
                          {auditScore}%
                        </span>
                      </div>
                      <Progress value={auditScore} className="h-1.5" />
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {REGULATORY_KEYS.map(({ key, label }) => (
                        <DocDot
                          key={key}
                          present={g.completeness[key]?.present ?? false}
                          label={label}
                        />
                      ))}
                    </div>

                    <div className="flex items-center justify-between">
                      <Badge
                        className={`text-xs ${
                          g.guardCardVerified ? "bg-green-500" : "bg-amber-500"
                        }`}
                      >
                        {g.guardCardVerified ? "Guard Card Verified" : "Not Verified"}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Sheet open={!!selectedId} onOpenChange={() => setSelectedId(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  Regulatory Package — {selected.firstName} {selected.lastName}
                </SheetTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    className={selected.guardCardVerified ? "bg-green-500" : "bg-amber-500"}
                  >
                    {selected.guardCardVerified ? "Guard Card Verified" : "Not Verified"}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {workerLabel(selected.workerType)}
                  </Badge>
                </div>
              </SheetHeader>

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-3">
                  State Regulatory Documents
                </p>
                {REGULATORY_KEYS.map(({ key, label }) => {
                  const entry = selected.completeness[key];
                  const present = entry?.present ?? false;
                  const doc = entry?.doc;
                  const downloadUrl = doc?.fileUrl
                    ? doc.fileUrl.replace("/view/", "/download/")
                    : null;
                  return (
                    <div
                      key={key}
                      data-testid={`auditor-doc-${key}-${selected.id}`}
                      className={`rounded-md border p-3 ${
                        present
                          ? "border-green-500/30 bg-green-500/5"
                          : "border-destructive/20 bg-destructive/5"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          {present ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{label}</p>
                            {doc ? (
                              <>
                                <p className="text-xs text-muted-foreground truncate">
                                  {doc.documentDescription || doc.documentName}
                                </p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  {doc.uploadedAt && (
                                    <span className="text-xs text-muted-foreground">
                                      Signed {format(new Date(doc.uploadedAt), "MMM d, yyyy")}
                                    </span>
                                  )}
                                  {doc.isVerified && (
                                    <span className="flex items-center gap-0.5 text-xs text-green-600 font-medium">
                                      <ShieldCheck className="h-3 w-3" />
                                      {doc.verifiedBy ? `Verified by ${doc.verifiedBy}` : "Verified"}
                                    </span>
                                  )}
                                  {doc.expirationDate && (
                                    <span className="text-xs text-amber-500">
                                      Exp. {format(new Date(doc.expirationDate), "MMM d, yyyy")}
                                    </span>
                                  )}
                                </div>
                              </>
                            ) : (
                              <p className="text-xs text-destructive">Not on file — required</p>
                            )}
                          </div>
                        </div>
                        {doc?.fileUrl && (
                          <div className="flex items-center gap-1 shrink-0">
                            <a
                              href={doc.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="View document"
                              data-testid={`btn-view-auditor-doc-${key}`}
                            >
                              <Button size="icon" variant="ghost">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </a>
                            {downloadUrl && (
                              <a
                                href={downloadUrl}
                                download
                                title="Download document"
                                data-testid={`btn-download-auditor-doc-${key}`}
                              >
                                <Button size="icon" variant="ghost">
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 p-3 rounded-md border border-border bg-muted/20">
                <p className="text-xs text-muted-foreground">
                  This package is read-only and matches what is presented to state regulatory
                  auditors. All document access is logged.
                </p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function SpsDocumentSafe() {
  return (
    <CanvasHubPage
      config={{
        id: "sps-document-safe",
        title: "Document Safe",
        subtitle:
          "Organizational credentials, staff packets, client contracts, and regulatory packages",
        category: "operations",
      }}
    >
      <Tabs defaultValue="company" className="space-y-6">
        <TabsList className="grid grid-cols-4 w-full max-w-xl" data-testid="tabs-document-safe">
          <TabsTrigger
            value="company"
            className="flex items-center gap-1.5"
            data-testid="tab-company"
          >
            <Building2 className="h-3.5 w-3.5" />
            Company
          </TabsTrigger>
          <TabsTrigger
            value="staff"
            className="flex items-center gap-1.5"
            data-testid="tab-staff"
          >
            <Users className="h-3.5 w-3.5" />
            Staff
          </TabsTrigger>
          <TabsTrigger
            value="reports"
            className="flex items-center gap-1.5"
            data-testid="tab-reports"
          >
            <FileText className="h-3.5 w-3.5" />
            Reports
          </TabsTrigger>
          <TabsTrigger
            value="auditor"
            className="flex items-center gap-1.5"
            data-testid="tab-auditor"
          >
            <Shield className="h-3.5 w-3.5" />
            Auditor
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company">
          <CompanyTab />
        </TabsContent>

        <TabsContent value="staff">
          <StaffTab />
        </TabsContent>

        <TabsContent value="reports">
          <ReportsTab />
        </TabsContent>

        <TabsContent value="auditor">
          <AuditorTab />
        </TabsContent>
      </Tabs>
    </CanvasHubPage>
  );
}
