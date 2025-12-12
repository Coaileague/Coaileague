import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState } from "react";
import { 
  Bug, Search, Loader2, CheckCircle, XCircle, Clock, 
  Wrench, FileCode, AlertCircle, RefreshCw, ExternalLink
} from "lucide-react";

interface BugReport {
  id: string;
  title: string;
  description: string;
  url?: string;
  userAgent?: string;
  timestamp: string;
  status: string;
}

interface BugAnalysis {
  reportId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  rootCause: string;
  proposedFix: string;
  affectedFiles: string[];
  confidence: number;
  status: 'analyzing' | 'ready' | 'approved' | 'rejected' | 'applied';
  createdAt: string;
}

const STATUS_STEPS = [
  { key: 'submitted', label: 'Submitted', icon: Bug },
  { key: 'analyzing', label: 'AI Analyzing', icon: Search },
  { key: 'ready', label: 'Fix Proposed', icon: FileCode },
  { key: 'approved', label: 'Approved', icon: CheckCircle },
  { key: 'applied', label: 'Fix Applied', icon: Wrench },
];

const SEVERITY_COLORS = {
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

function StatusTimeline({ currentStatus }: { currentStatus: string }) {
  const currentIndex = STATUS_STEPS.findIndex(s => s.key === currentStatus);
  const isRejected = currentStatus === 'rejected';
  
  return (
    <div className="flex items-center justify-between w-full py-4">
      {STATUS_STEPS.map((step, index) => {
        const Icon = step.icon;
        const isComplete = index < currentIndex || currentStatus === 'applied';
        const isCurrent = step.key === currentStatus;
        const isPending = index > currentIndex && !isRejected;
        
        return (
          <div key={step.key} className="flex flex-col items-center flex-1 relative">
            {index > 0 && (
              <div 
                className={`absolute left-0 right-1/2 top-4 h-0.5 -translate-y-1/2 ${
                  isComplete ? 'bg-green-500' : 'bg-muted'
                }`}
              />
            )}
            {index < STATUS_STEPS.length - 1 && (
              <div 
                className={`absolute left-1/2 right-0 top-4 h-0.5 -translate-y-1/2 ${
                  isComplete && !isCurrent ? 'bg-green-500' : 'bg-muted'
                }`}
              />
            )}
            <div 
              className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center ${
                isComplete ? 'bg-green-500 text-white' :
                isCurrent ? 'bg-primary text-primary-foreground' :
                'bg-muted text-muted-foreground'
              }`}
            >
              {isComplete ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <Icon className={`h-4 w-4 ${isCurrent ? 'animate-pulse' : ''}`} />
              )}
            </div>
            <span className={`text-xs mt-2 text-center ${
              isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground'
            }`}>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface BugReportTrackerProps {
  reportId?: string;
  trigger?: React.ReactNode;
}

export function BugReportTracker({ reportId: initialReportId, trigger }: BugReportTrackerProps) {
  const [open, setOpen] = useState(false);
  const [searchId, setSearchId] = useState(initialReportId || '');
  const [activeId, setActiveId] = useState(initialReportId || '');

  const reportQuery = useQuery<{ success: boolean; data: BugReport }>({
    queryKey: ['/api/bug-remediation/report', activeId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/bug-remediation/report/${activeId}`);
      return response.json();
    },
    enabled: !!activeId && open,
    refetchInterval: 10000,
    retry: false,
  });

  const analysisQuery = useQuery<{ success: boolean; data: BugAnalysis }>({
    queryKey: ['/api/bug-remediation/analysis', activeId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/bug-remediation/analysis/${activeId}`);
      return response.json();
    },
    enabled: !!activeId && open,
    refetchInterval: 5000,
    retry: false,
  });

  const report = reportQuery.data?.data;
  const analysis = analysisQuery.data?.data;
  const isLoading = reportQuery.isLoading || analysisQuery.isLoading;
  const currentStatus = analysis?.status || (report ? 'analyzing' : 'submitted');

  const handleSearch = () => {
    if (searchId.trim()) {
      setActiveId(searchId.trim());
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2" data-testid="button-track-bug">
            <Search className="h-4 w-4" />
            Track Bug Report
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5 text-primary" />
            Bug Report Tracker
          </DialogTitle>
          <DialogDescription>
            Track the status of your bug report and see the AI analysis results.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="report-id" className="sr-only">Report ID</Label>
              <Input
                id="report-id"
                placeholder="Enter your bug report ID"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                data-testid="input-report-id"
              />
            </div>
            <Button onClick={handleSearch} disabled={!searchId.trim()} data-testid="button-search-report">
              <Search className="h-4 w-4" />
            </Button>
            {activeId && (
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => {
                  reportQuery.refetch();
                  analysisQuery.refetch();
                }}
                data-testid="button-refresh-report"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>

          {isLoading && activeId && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && reportQuery.error && (
            <Card className="border-destructive">
              <CardContent className="flex items-center gap-3 py-4">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <div>
                  <p className="font-medium">Report Not Found</p>
                  <p className="text-sm text-muted-foreground">
                    Could not find a bug report with ID: {activeId}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {report && !isLoading && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 flex-1">
                      <CardTitle className="text-base" data-testid="text-report-title">
                        {report.title}
                      </CardTitle>
                      <CardDescription className="text-xs font-mono" data-testid="text-report-id">
                        ID: {report.id}
                      </CardDescription>
                    </div>
                    {analysis && (
                      <Badge className={SEVERITY_COLORS[analysis.severity]} data-testid="badge-severity">
                        {analysis.severity.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <StatusTimeline currentStatus={currentStatus} />

                  {currentStatus === 'rejected' && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300">
                      <XCircle className="h-5 w-5" />
                      <span className="text-sm">This fix was rejected by support staff.</span>
                    </div>
                  )}

                  {analysis && (
                    <div className="space-y-3 pt-2 border-t">
                      <div>
                        <h4 className="text-sm font-medium mb-1">Category</h4>
                        <Badge variant="outline" data-testid="badge-category">{analysis.category}</Badge>
                      </div>

                      <div>
                        <h4 className="text-sm font-medium mb-1">Root Cause Analysis</h4>
                        <p className="text-sm text-muted-foreground" data-testid="text-root-cause">
                          {analysis.rootCause}
                        </p>
                      </div>

                      <div>
                        <h4 className="text-sm font-medium mb-1">Proposed Fix</h4>
                        <p className="text-sm text-muted-foreground" data-testid="text-proposed-fix">
                          {analysis.proposedFix}
                        </p>
                      </div>

                      {analysis.affectedFiles?.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium mb-1">Affected Files</h4>
                          <div className="flex flex-wrap gap-1">
                            {analysis.affectedFiles.map((file, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs font-mono">
                                {file}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2">
                        <div className="text-xs text-muted-foreground">
                          AI Confidence: {Math.round(analysis.confidence * 100)}%
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Analyzed: {new Date(analysis.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )}

                  {!analysis && currentStatus === 'analyzing' && (
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <div>
                        <p className="text-sm font-medium">Trinity AI is analyzing your report</p>
                        <p className="text-xs text-muted-foreground">
                          This usually takes 1-2 minutes. The page will auto-update.
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {!activeId && (
            <div className="text-center py-8 text-muted-foreground">
              <Bug className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Enter your bug report ID to track its status</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
