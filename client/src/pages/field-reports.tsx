/**
 * Universal Field Reports Page
 * Single page for mobile + desktop - adapts layout based on device
 * 
 * Features:
 * - Create incident/safety/daily reports
 * - View report history
 * - Manager review and approval
 * - Send approved reports to clients
 */

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { format } from "date-fns";
import {
  AlertTriangle,
  Shield,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Send,
  MapPin,
  Camera,
  Plus,
  ArrowLeft,
  ChevronRight,
  User,
  Building2,
  Filter,
  Download,
  Eye,
  Loader2,
  ClipboardCheck,
  Bot,
  Lightbulb,
  ShieldAlert,
  Wrench
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UniversalModal, UniversalModalDescription, UniversalModalHeader, UniversalModalTitle, UniversalModalTrigger, UniversalModalFooter, UniversalModalContent } from '@/components/ui/universal-modal';
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub/CanvasHubRegistry";
import { useToast } from "@/hooks/use-toast";
import { useLocationCapture } from "@/hooks/use-location-capture";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type ReportType = 'incident' | 'safety' | 'daily';
type ReportStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'delivered';

interface ReportSubmission {
  id: number;
  templateId: number;
  workspaceId: string;
  employeeId: string;
  employeeName?: string;
  title: string;
  reportType: ReportType;
  status: ReportStatus;
  data: Record<string, any>;
  location?: { lat: number; lng: number };
  clientId?: string;
  clientName?: string;
  reviewerNotes?: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  approvedAt?: string;
}

interface ReportTemplate {
  id: number;
  name: string;
  reportType: ReportType;
  fields: Array<{
    name: string;
    label: string;
    type: string;
    required: boolean;
    options?: string[];
  }>;
}

const REPORT_TYPE_CONFIG = {
  incident: {
    label: 'Incident Report',
    icon: AlertTriangle,
    color: 'text-red-500',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    description: 'Report security incidents, emergencies, or unusual events',
  },
  safety: {
    label: 'Safety Check',
    icon: Shield,
    color: 'text-green-500',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    description: 'Complete site safety inspections and checklists',
  },
  daily: {
    label: 'Daily Report',
    icon: FileText,
    color: 'text-blue-500',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    description: 'Submit end-of-shift activity summaries',
  },
};

const STATUS_CONFIG: Record<ReportStatus, { label: string; color: string; icon: typeof Clock }> = {
  draft: { label: 'Draft', color: 'bg-slate-100 dark:bg-slate-900/30 text-slate-600 dark:text-slate-400', icon: FileText },
  submitted: { label: 'Submitted', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400', icon: Send },
  under_review: { label: 'Under Review', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400', icon: Clock },
  approved: { label: 'Approved', color: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400', icon: XCircle },
  delivered: { label: 'Delivered', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400', icon: Send },
};

export default function FieldReports() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const queryClientRef = useQueryClient();
  const isMobile = useIsMobile();
  
  const [activeTab, setActiveTab] = useState<'create' | 'history' | 'review'>('create');
  const [selectedType, setSelectedType] = useState<ReportType | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const { locationData, setLocationData, captureLocation } = useLocationCapture();
  const [aiAnalysis, setAiAnalysis] = useState<{ recommendations: string[]; riskLevel: string; suggestedActions: string[]; summary: string } | null>(null);
  const [aiAnalyzed, setAiAnalyzed] = useState(false);
  const isManager = user?.role === 'org_owner' || user?.role === 'supervisor' || user?.role === 'manager';

  // Handle URL parameter for pre-selecting report type
  // Track previous searchString to detect changes
  const prevSearchRef = useRef<string | null>(null);
  
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const typeParam = params.get('type') as ReportType | null;
    
    // Only process if we have a type param and it's different from what we processed
    if (typeParam && ['incident', 'safety', 'daily'].includes(typeParam)) {
      if (prevSearchRef.current !== searchString) {
        prevSearchRef.current = searchString;
        setSelectedType(typeParam);
        setShowCreateDialog(true);
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              setLocationData({
                lat: position.coords.latitude,
                lng: position.coords.longitude,
              });
            },
            () => {},
            { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
          );
        }
      }
    }
  }, [searchString]);

  const { data: myReports = [], isLoading: reportsLoading } = useQuery<ReportSubmission[]>({
    queryKey: ['/api/report-submissions'],
  });

  const { data: templates = [] } = useQuery<ReportTemplate[]>({
    queryKey: ['/api/report-templates'],
  });

  // For pending reviews, we fetch all submissions and filter client-side for submitted/under_review status
  const { data: allSubmissions = [] } = useQuery<ReportSubmission[]>({
    queryKey: ['/api/report-submissions'],
    enabled: isManager,
  });
  
  // Filter for pending reviews (submitted or under_review status)
  const pendingReviews = allSubmissions.filter(r => 
    r.status === 'submitted' || r.status === 'under_review'
  );


  const submitReportMutation = useMutation({
    mutationFn: async (data: { reportType: ReportType; title: string; data: Record<string, any> }) => {
      return apiRequest('POST', '/api/report-submissions', {
        ...data,
        location: locationData,
        status: 'submitted',
      });
    },
    onSuccess: () => {
      queryClientRef.invalidateQueries({ queryKey: ['/api/report-submissions'] });
      toast({ title: 'Report submitted successfully' });
      setShowCreateDialog(false);
      setSelectedType(null);
      setFormData({});
      setLocationData(null);
      setAiAnalysis(null);
      setAiAnalyzed(false);
    },
    onError: (error: any) => {
      toast({ title: 'Failed to submit report', description: error.message, variant: 'destructive' });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, action, notes }: { id: number; action: 'approve' | 'reject'; notes?: string }) => {
      return apiRequest('POST', `/api/report-submissions/${id}/review`, { action, notes });
    },
    onSuccess: () => {
      queryClientRef.invalidateQueries({ queryKey: ['/api/report-submissions'] });
      toast({ title: 'Report reviewed' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Review Report Failed',
        description: error.message || 'Something went wrong.',
        variant: 'destructive',
      });
    },
  });

  const sendToClientMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('POST', `/api/report-submissions/${id}/send-to-client`, {});
    },
    onSuccess: () => {
      queryClientRef.invalidateQueries({ queryKey: ['/api/report-submissions'] });
      toast({ title: 'Report sent to client' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Send Report to Client Failed',
        description: error.message || 'Something went wrong.',
        variant: 'destructive',
      });
    },
  });

  const analyzeIncidentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/incidents/ai-analyze', {
        type: formData.incidentType || 'other',
        severity: formData.severity || 'medium',
        description: formData.description || '',
        title: formData.title || '',
        location: locationData,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      setAiAnalysis(data);
      setAiAnalyzed(true);
      toast({ title: 'AI Analysis Complete', description: 'Review the recommendations below before submitting.' });
    },
    onError: (error: any) => {
      setAiAnalyzed(true);
      setAiAnalysis({
        recommendations: ['Unable to perform AI analysis. You can still submit the report manually.'],
        riskLevel: formData.severity || 'medium',
        suggestedActions: ['Submit report to chain of command for manual review'],
        summary: 'AI analysis unavailable - report will be reviewed by management.',
      });
      toast({ title: 'AI Analysis', description: 'Proceeding with manual submission option.', variant: 'destructive' });
    },
  });

  const handleAnalyze = () => {
    if (!formData.description && !formData.incidentType) {
      toast({ title: 'Add Details First', description: 'Please describe the incident and select a type before analyzing.', variant: 'destructive' });
      return;
    }
    analyzeIncidentMutation.mutate();
  };

  const handleSubmit = () => {
    if (!selectedType) return;
    const title = formData.title || `${REPORT_TYPE_CONFIG[selectedType].label} - ${format(new Date(), 'MMM d, yyyy')}`;
    submitReportMutation.mutate({
      reportType: selectedType,
      title,
      data: { ...formData, aiAnalysis: aiAnalysis || undefined },
    });
  };

  const ReportTypeCard = ({ type }: { type: ReportType }) => {
    const config = REPORT_TYPE_CONFIG[type];
    const Icon = config.icon;
    
    return (
      <button
        onClick={() => {
          setSelectedType(type);
          setShowCreateDialog(true);
          captureLocation();
        }}
        className="w-full text-left"
        data-testid={`card-create-${type}`}
      >
        <Card className="hover-elevate active-elevate-2 transition-all">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", config.bgColor)}>
                <Icon className={cn("w-6 h-6", config.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold">{config.label}</h3>
                <p className="text-sm text-muted-foreground line-clamp-1">{config.description}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </button>
    );
  };

  const ReportHistoryCard = ({ report }: { report: ReportSubmission }) => {
    const typeConfig = REPORT_TYPE_CONFIG[report.reportType] || REPORT_TYPE_CONFIG.daily;
    const statusConfig = STATUS_CONFIG[report.status] || STATUS_CONFIG.draft;
    const TypeIcon = typeConfig.icon;
    const StatusIcon = statusConfig.icon;
    
    return (
      <Card className="overflow-hidden" data-testid={`card-report-${report.id}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", typeConfig.bgColor)}>
              <TypeIcon className={cn("w-5 h-5", typeConfig.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-medium truncate">{report.title}</h4>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span>{format(new Date(report.createdAt), 'MMM d, h:mm a')}</span>
              </div>
              {report.clientName && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>{report.clientName}</span>
                </div>
              )}
            </div>
            <Badge className={cn("shrink-0", statusConfig.color)}>
              <StatusIcon className="w-3 h-3 mr-1" />
              {statusConfig.label}
            </Badge>
          </div>
          
          {isManager && report.status === 'approved' && (
            <div className="mt-3 pt-3 border-t flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => sendToClientMutation.mutate(report.id)}
                disabled={sendToClientMutation.isPending}
              >
                <Send className="w-4 h-4 mr-1.5" />
                Send to Client
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const PendingReviewCard = ({ report }: { report: ReportSubmission }) => {
    const typeConfig = REPORT_TYPE_CONFIG[report.reportType] || REPORT_TYPE_CONFIG.daily;
    const TypeIcon = typeConfig.icon;
    const [notes, setNotes] = useState('');
    
    return (
      <Card data-testid={`card-review-${report.id}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3 mb-3">
            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", typeConfig.bgColor)}>
              <TypeIcon className={cn("w-5 h-5", typeConfig.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium">{report.title}</h4>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="w-3.5 h-3.5" />
                <span>{report.employeeName || 'Employee'}</span>
                <span>•</span>
                <span>{format(new Date(report.createdAt), 'MMM d')}</span>
              </div>
            </div>
          </div>
          
          <div className="bg-muted/50 rounded-lg p-3 mb-3 text-sm">
            {report.data?.description || report.data?.summary || 'No details provided'}
          </div>
          
          <Textarea
            placeholder="Add review notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mb-3 resize-none"
            rows={2}
          />
          
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => reviewMutation.mutate({ id: report.id, action: 'reject', notes })}
              disabled={reviewMutation.isPending}
            >
              <XCircle className="w-4 h-4 mr-1.5" />
              Reject
            </Button>
            <Button
              size="sm"
              className="flex-1 bg-green-600"
              onClick={() => reviewMutation.mutate({ id: report.id, action: 'approve', notes })}
              disabled={reviewMutation.isPending}
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              Approve
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const CreateReportForm = () => {
    if (!selectedType) return null;
    const config = REPORT_TYPE_CONFIG[selectedType];
    const Icon = config.icon;
    
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b">
          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", config.bgColor)}>
            <Icon className={cn("w-5 h-5", config.color)} />
          </div>
          <div>
            <h3 className="font-semibold">{config.label}</h3>
            <p className="text-sm text-muted-foreground">{config.description}</p>
          </div>
        </div>
        
        <div className="space-y-3">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder={`${config.label} - ${format(new Date(), 'MMM d, yyyy')}`}
              value={formData.title || ''}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              data-testid="input-report-title"
            />
          </div>
          
          {selectedType === 'incident' && (
            <>
              <div>
                <Label>Severity</Label>
                <Select
                  value={formData.severity || 'medium'}
                  onValueChange={(v) => { setFormData({ ...formData, severity: v }); setAiAnalyzed(false); setAiAnalysis(null); }}
                >
                  <SelectTrigger data-testid="select-severity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Incident Type</Label>
                <Select
                  value={formData.incidentType || ''}
                  onValueChange={(v) => { setFormData({ ...formData, incidentType: v }); setAiAnalyzed(false); setAiAnalysis(null); }}
                >
                  <SelectTrigger data-testid="select-incident-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="suspicious_person">Suspicious Person</SelectItem>
                    <SelectItem value="suspicious_vehicle">Suspicious Vehicle</SelectItem>
                    <SelectItem value="property_damage">Property Damage</SelectItem>
                    <SelectItem value="medical_emergency">Medical Emergency</SelectItem>
                    <SelectItem value="fire_safety">Fire/Safety Hazard</SelectItem>
                    <SelectItem value="theft">Theft/Break-in</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          
          {selectedType === 'safety' && (
            <div className="space-y-2">
              <Label>Safety Checklist</Label>
              {['Fire exits clear', 'Emergency equipment accessible', 'No hazards observed', 'Lighting adequate', 'All doors secure'].map((item) => (
                <label key={item} className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData[item.replace(/\s/g, '_')] || false}
                    onChange={(e) => setFormData({ ...formData, [item.replace(/\s/g, '_')]: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">{item}</span>
                </label>
              ))}
            </div>
          )}

          {/* Readiness Section 20 — Daily Activity Report fields.
              Replaces the MISS called out in the mobile reality check:
              DAR type previously had no dedicated form block, so
              submissions dropped all DAR-specific detail. */}
          {selectedType === 'daily' && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="dar-shift-summary">Shift summary</Label>
                <Textarea
                  id="dar-shift-summary"
                  placeholder="Brief summary of this shift — site, hours, notable events."
                  value={formData.shiftSummary || ''}
                  onChange={(e) => setFormData({ ...formData, shiftSummary: e.target.value })}
                  rows={3}
                  className="resize-none"
                  data-testid="input-dar-shift-summary"
                />
              </div>
              <div>
                <Label htmlFor="dar-activities">Activities performed</Label>
                <Textarea
                  id="dar-activities"
                  placeholder="Patrols, checkpoints, visitors screened, tours completed."
                  value={formData.activitiesPerformed || ''}
                  onChange={(e) => setFormData({ ...formData, activitiesPerformed: e.target.value })}
                  rows={3}
                  className="resize-none"
                  data-testid="input-dar-activities"
                />
              </div>
              <div>
                <Label htmlFor="dar-handoff">Hand-off / relief notes</Label>
                <Textarea
                  id="dar-handoff"
                  placeholder="What the next officer needs to know — open issues, ongoing situations."
                  value={formData.handoffNotes || ''}
                  onChange={(e) => setFormData({ ...formData, handoffNotes: e.target.value })}
                  rows={2}
                  className="resize-none"
                  data-testid="input-dar-handoff"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="dar-visitors">Visitors (count)</Label>
                  <Input
                    id="dar-visitors"
                    type="number"
                    min={0}
                    placeholder="0"
                    value={formData.visitorCount ?? ''}
                    onChange={(e) => setFormData({ ...formData, visitorCount: Number(e.target.value) || 0 })}
                    data-testid="input-dar-visitors"
                  />
                </div>
                <div>
                  <Label htmlFor="dar-incidents">Incidents (count)</Label>
                  <Input
                    id="dar-incidents"
                    type="number"
                    min={0}
                    placeholder="0"
                    value={formData.incidentCount ?? ''}
                    onChange={(e) => setFormData({ ...formData, incidentCount: Number(e.target.value) || 0 })}
                    data-testid="input-dar-incidents"
                  />
                </div>
              </div>
            </div>
          )}
          
          <div>
            <Label htmlFor="description">Description / Notes</Label>
            <Textarea
              id="description"
              placeholder="Provide details about this report..."
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className="resize-none"
              data-testid="input-report-description"
            />
          </div>
          
          <Button
            variant="outline"
            className="w-full"
            onClick={captureLocation}
            data-testid="button-capture-location"
          >
            <MapPin className={cn("w-4 h-4 mr-2", locationData ? "text-green-500" : "")} />
            {locationData ? 'Location Captured' : 'Capture Location'}
          </Button>
          
          {selectedType === 'incident' && (
            <div className="space-y-3 pt-2">
              <Button
                variant="outline"
                className="w-full border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400"
                onClick={handleAnalyze}
                disabled={analyzeIncidentMutation.isPending}
                data-testid="button-ai-analyze"
              >
                {analyzeIncidentMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Bot className="w-4 h-4 mr-2" />
                )}
                {analyzeIncidentMutation.isPending ? 'Analyzing...' : 'Analyze with HelpAI'}
              </Button>
              
              {aiAnalysis && (
                <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30">
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">HelpAI Analysis</span>
                      <Badge className={cn("ml-auto text-xs", 
                        aiAnalysis.riskLevel === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        aiAnalysis.riskLevel === 'high' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                        aiAnalysis.riskLevel === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                        'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      )}>
                        <ShieldAlert className="w-3 h-3 mr-1" />
                        {aiAnalysis.riskLevel} risk
                      </Badge>
                    </div>
                    
                    <p className="text-sm text-muted-foreground">{aiAnalysis.summary}</p>
                    
                    {aiAnalysis.recommendations.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recommendations</span>
                        </div>
                        <ul className="space-y-1">
                          {aiAnalysis.recommendations.map((rec, i) => (
                            <li key={i} className="text-sm flex items-start gap-2">
                              <span className="text-blue-500 mt-1 shrink-0">-</span>
                              <span>{rec}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {aiAnalysis.suggestedActions.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Wrench className="w-3.5 h-3.5 text-green-500" />
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suggested Actions</span>
                        </div>
                        <ul className="space-y-1">
                          {aiAnalysis.suggestedActions.map((action, i) => (
                            <li key={i} className="text-sm flex items-start gap-2">
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                              <span>{action}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const pendingCount = pendingReviews?.filter(r => r.status === 'submitted' || r.status === 'under_review').length || 0;
  const myReportsCount = myReports?.length || 0;

  const mobilePageConfig: CanvasPageConfig = {
    id: "field-reports",
    title: "Field Reports",
    subtitle: isManager ? `${pendingCount} pending review` : `${myReportsCount} reports`,
    category: "operations",
    backButton: true,
    onBack: () => setLocation('/dashboard'),
    withBottomNav: true,
  };

  if (isMobile) {
    return (
      <CanvasHubPage config={mobilePageConfig}>
        <div>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="w-full mb-4 h-auto p-1">
              <TabsTrigger value="create" className="flex-1 text-xs sm:text-sm py-2 px-2">
                Create
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-1 text-xs sm:text-sm py-2 px-2">
                History
              </TabsTrigger>
              {isManager && (
                <TabsTrigger value="review" className="flex-1 relative text-xs sm:text-sm py-2 px-2">
                  Review
                  {pendingCount > 0 && (
                    <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">
                      {pendingCount}
                    </Badge>
                  )}
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="create" className="space-y-3 mt-0">
              {Object.keys(REPORT_TYPE_CONFIG).map((type) => (
                <ReportTypeCard key={type} type={type as ReportType} />
              ))}
            </TabsContent>

            <TabsContent value="history" className="space-y-3 mt-0">
              {reportsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : myReports.length === 0 ? (
                <Card className="p-6 text-center">
                  <FileText className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No reports yet</p>
                </Card>
              ) : (
                myReports.map((report) => (
                  <ReportHistoryCard key={report.id} report={report} />
                ))
              )}
            </TabsContent>

            {isManager && (
              <TabsContent value="review" className="space-y-3 mt-0">
                {pendingCount === 0 ? (
                  <Card className="p-6 text-center">
                    <CheckCircle2 className="w-10 h-10 mx-auto text-green-500 mb-2" />
                    <p className="text-sm text-muted-foreground">All reports reviewed</p>
                  </Card>
                ) : (
                  pendingReviews
                    .filter(r => r.status === 'submitted' || r.status === 'under_review')
                    .map((report) => (
                      <PendingReviewCard key={report.id} report={report} />
                    ))
                )}
              </TabsContent>
            )}
          </Tabs>
        </div>

        <UniversalModal open={showCreateDialog} onOpenChange={(open) => { setShowCreateDialog(open); if (!open) { setAiAnalysis(null); setAiAnalyzed(false); } }}>
          <UniversalModalContent size="default" className="overflow-y-auto">
            <UniversalModalHeader>
              <UniversalModalTitle>{selectedType === 'incident' ? 'Report Incident' : selectedType === 'safety' ? 'Safety Check' : 'New Report'}</UniversalModalTitle>
            </UniversalModalHeader>
            <CreateReportForm />
            <UniversalModalFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitReportMutation.isPending}
                data-testid="button-submit-report"
              >
                {submitReportMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                {selectedType === 'incident' ? 'Submit to Chain of Command' : 'Submit Report'}
              </Button>
            </UniversalModalFooter>
          </UniversalModalContent>
        </UniversalModal>
      </CanvasHubPage>
    );
  }

  const desktopPageConfig: CanvasPageConfig = {
    id: "field-reports",
    title: "Field Reports",
    subtitle: "Create, view, and manage field reports",
    category: "operations",
    backButton: true,
    onBack: () => setLocation('/dashboard'),
    headerActions: (
      <Button onClick={() => setShowCreateDialog(true)} data-testid="button-new-report">
        <Plus className="w-4 h-4 mr-2" />
        New Report
      </Button>
    ),
  };

  return (
    <CanvasHubPage config={desktopPageConfig}>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="mb-4">
          <TabsTrigger value="create">
            <ClipboardCheck className="w-4 h-4 mr-2" />
            Create Report
          </TabsTrigger>
          <TabsTrigger value="history">
            <FileText className="w-4 h-4 mr-2" />
            My Reports ({myReportsCount})
          </TabsTrigger>
          {isManager && (
            <TabsTrigger value="review" className="relative">
              <Eye className="w-4 h-4 mr-2" />
              Review
              {pendingCount > 0 && (
                <Badge variant="destructive" className="ml-2">{pendingCount}</Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="create">
          <div className="grid gap-4 md:grid-cols-3">
            {Object.keys(REPORT_TYPE_CONFIG).map((type) => (
              <ReportTypeCard key={type} type={type as ReportType} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {reportsLoading ? (
              <div className="col-span-full flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : myReports.length === 0 ? (
              <Card className="col-span-full p-8 text-center">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No reports submitted yet</p>
                <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
                  Create Your First Report
                </Button>
              </Card>
            ) : (
              myReports.map((report) => (
                <ReportHistoryCard key={report.id} report={report} />
              ))
            )}
          </div>
        </TabsContent>

        {isManager && (
          <TabsContent value="review">
            <div className="grid gap-4 md:grid-cols-2">
              {pendingCount === 0 ? (
                <Card className="col-span-full p-8 text-center">
                  <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-3" />
                  <h3 className="text-lg font-semibold mb-1">All Caught Up!</h3>
                  <p className="text-muted-foreground">No reports pending review</p>
                </Card>
              ) : (
                pendingReviews
                  .filter(r => r.status === 'submitted' || r.status === 'under_review')
                  .map((report) => (
                    <PendingReviewCard key={report.id} report={report} />
                  ))
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>

      <UniversalModal open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <UniversalModalContent size="default" className="overflow-y-auto">
          <UniversalModalHeader>
            <UniversalModalTitle>Create New Report</UniversalModalTitle>
            <UniversalModalDescription>
              {selectedType 
                ? REPORT_TYPE_CONFIG[selectedType].description 
                : 'Select a report type to get started'}
            </UniversalModalDescription>
          </UniversalModalHeader>
          
          {!selectedType ? (
            <div className="grid gap-3">
              {Object.entries(REPORT_TYPE_CONFIG).map(([type, config]) => {
                const Icon = config.icon;
                return (
                  <button
                    key={type}
                    onClick={() => {
                      setSelectedType(type as ReportType);
                      captureLocation();
                    }}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 text-left transition-colors"
                  >
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", config.bgColor)}>
                      <Icon className={cn("w-5 h-5", config.color)} />
                    </div>
                    <div>
                      <p className="font-medium">{config.label}</p>
                      <p className="text-sm text-muted-foreground">{config.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <CreateReportForm />
          )}
          
          <UniversalModalFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => {
                if (selectedType) {
                  setSelectedType(null);
                  setFormData({});
                  setAiAnalysis(null);
                  setAiAnalyzed(false);
                } else {
                  setShowCreateDialog(false);
                }
              }}
            >
              {selectedType ? 'Back' : 'Cancel'}
            </Button>
            {selectedType && (
              <Button
                onClick={handleSubmit}
                disabled={submitReportMutation.isPending}
                data-testid="button-submit-report-desktop"
              >
                {submitReportMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                {selectedType === 'incident' ? 'Submit to Chain of Command' : 'Submit Report'}
              </Button>
            )}
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
    </CanvasHubPage>
  );
}
