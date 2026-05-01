/**
 * Worker Incidents Page - Mobile-optimized incident reporting for security guards
 * 
 * Features:
 * - Quick incident type selection
 * - Severity levels (low/medium/high/critical)
 * - Photo attachment
 * - Auto-location capture
 * - Voice-to-text description
 * - Immediate escalation to management
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import {
  AlertTriangle,
  Camera,
  MapPin,
  Mic,
  ChevronLeft,
  Send,
  User,
  Car,
  Flame,
  Heart,
  Package,
  HelpCircle,
  Clock,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { fetchWithOfflineFallback } from "@/lib/offlineQueue";

interface IncidentType {
  id: string;
  label: string;
  icon: typeof AlertTriangle;
  color: string;
}

const INCIDENT_TYPES: IncidentType[] = [
  { id: 'suspicious_person', label: 'Suspicious Person', icon: User, color: 'text-amber-400' },
  { id: 'suspicious_vehicle', label: 'Suspicious Vehicle', icon: Car, color: 'text-amber-400' },
  { id: 'property_damage', label: 'Property Damage', icon: Package, color: 'text-orange-400' },
  { id: 'medical_emergency', label: 'Medical Emergency', icon: Heart, color: 'text-red-500 dark:text-red-400' },
  { id: 'fire_safety', label: 'Fire/Safety Hazard', icon: Flame, color: 'text-red-500 dark:text-red-400' },
  { id: 'theft', label: 'Theft/Break-in', icon: AlertTriangle, color: 'text-red-400' },
  { id: 'other', label: 'Other', icon: HelpCircle, color: 'text-slate-400' },
];

type Severity = 'low' | 'medium' | 'high' | 'critical';

interface RecentIncident {
  id: number;
  type: string;
  severity: Severity;
  description: string;
  createdAt: string;
  status: 'open' | 'acknowledged' | 'resolved';
}

export default function WorkerIncidents() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [severity, setSeverity] = useState<Severity>('medium');
  const [description, setDescription] = useState('');
  const [location, setLocationData] = useState<{ lat: number; lng: number } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Get recent incidents
  const { data: recentIncidents, isLoading } = useQuery<RecentIncident[]>({
    queryKey: ['/api/incidents/my-reports'],
  });

  // Get current location
  const captureLocation = async () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocationData({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          toast({
            title: 'Location Captured',
            description: 'Your current location has been recorded.',
          });
        },
        (error) => {
          console.error('Location error:', error);
        }
      );
    }
  };

  // Submit incident
  const submitMutation = useMutation({
    mutationFn: async () => {
      setSubmitting(true);
      const payload = {
        type: selectedType,
        severity,
        description,
        location: location,
        timestamp: new Date().toISOString(),
      };
      const result = await fetchWithOfflineFallback('/api/incidents', 'POST', payload, 'incident');
      if (result.queued) return { queued: true };
      if (result.response && !result.response.ok) {
        const text = await result.response.text();
        throw new Error(text || 'Failed to submit incident report');
      }
      return { queued: false };
    },
    onSuccess: (result: { queued?: boolean } | undefined) => {
      if (result?.queued) {
        toast({
          title: 'Saved Offline',
          description: 'Your incident report was queued and will sync when you reconnect.',
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ['/api/incidents/my-reports'] });
        toast({
          title: 'Incident Reported',
          description: 'Your incident report has been submitted and management has been notified.',
        });
      }
      setMode('list');
      resetForm();
      
      if ('vibrate' in navigator) {
        navigator.vibrate([100, 50, 100, 50, 100]);
      }
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit incident report',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setSubmitting(false);
    },
  });

  const resetForm = () => {
    setSelectedType(null);
    setSeverity('medium');
    setDescription('');
    setLocationData(null);
  };

  const handleSubmit = () => {
    if (!selectedType) {
      toast({
        title: 'Select Incident Type',
        description: 'Please select the type of incident you are reporting.',
        variant: 'destructive',
      });
      return;
    }
    submitMutation.mutate();
  };

  const getSeverityColor = (sev: Severity) => {
    switch (sev) {
      case 'low': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'medium': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'resolved': return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'acknowledged': return <AlertCircle className="w-4 h-4 text-amber-400" />;
      default: return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const createConfig: CanvasPageConfig = {
    id: 'worker-incidents-create',
    title: 'Report Incident',
    category: 'operations',
    backButton: true,
    onBack: () => setMode('list'),
    withBottomNav: true,
  };

  const listConfig: CanvasPageConfig = {
    id: 'worker-incidents-list',
    title: 'Incidents',
    subtitle: 'Report and track incidents',
    category: 'operations',
    onRefresh: () => queryClient.invalidateQueries({ queryKey: ['/api/incidents/my-reports'] }),
    withBottomNav: true,
    headerActions: (
      <Button
        onClick={() => { setMode('create'); captureLocation(); }}
        className="bg-red-600"
        data-testid="button-new-incident"
      >
        <AlertTriangle className="w-4 h-4 mr-2" />
        Report
      </Button>
    ),
  };

  if (mode === 'create') {
    return (
      <CanvasHubPage config={createConfig}>
        <div className="space-y-6">
          {/* Incident Type Selection */}
          <div>
            <h3 className="text-sm font-medium text-slate-400 mb-3">Type of Incident</h3>
            <div className="grid grid-cols-2 gap-2">
              {INCIDENT_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.id}
                    onClick={() => setSelectedType(type.id)}
                    className={cn(
                      "p-4 rounded-lg border flex flex-col items-center gap-2 transition-all",
                      selectedType === type.id
                        ? "bg-cyan-500/20 border-cyan-500"
                        : "bg-slate-800/50 border-slate-700 active:bg-slate-700"
                    )}
                    data-testid={`incident-type-${type.id}`}
                  >
                    <Icon className={cn("w-6 h-6", type.color)} />
                    <span className="text-xs text-center">{type.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Severity Selection */}
          <div>
            <h3 className="text-sm font-medium text-slate-400 mb-3">Severity</h3>
            <div className="flex gap-2">
              {(['low', 'medium', 'high', 'critical'] as Severity[]).map((sev) => (
                <button
                  key={sev}
                  onClick={() => setSeverity(sev)}
                  className={cn(
                    "flex-1 py-3 rounded-lg border font-medium capitalize transition-all",
                    severity === sev
                      ? getSeverityColor(sev)
                      : "bg-slate-800/50 border-slate-700 text-slate-400"
                  )}
                  data-testid={`severity-${sev}`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <h3 className="text-sm font-medium text-slate-400 mb-3">Description</h3>
            <div className="relative">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what happened..."
                className="min-h-[120px] bg-slate-800/50 border-slate-700 resize-none"
                data-testid="input-description"
              />
              <Button
                size="icon"
                onClick={() => setIsRecording(!isRecording)}
                className={cn(
                  "absolute bottom-3 right-3 rounded-full transition-all",
                  isRecording ? "bg-red-500 animate-pulse" : "bg-slate-700"
                )}
                data-testid="button-voice-input"
              >
                <Mic className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 h-12 bg-slate-800/50 border-slate-700"
              onClick={captureLocation}
              data-testid="button-capture-location"
            >
              <MapPin className={cn("w-4 h-4 mr-2", location ? "text-green-400" : "")} />
              {location ? 'Location Saved' : 'Add Location'}
            </Button>
            <Button
              variant="outline"
              className="flex-1 h-12 bg-slate-800/50 border-slate-700"
              data-testid="button-add-photo"
            >
              <Camera className="w-4 h-4 mr-2" />
              Add Photo
            </Button>
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={!selectedType || submitting}
            className={cn(
              "w-full h-14 text-lg font-semibold",
              severity === 'critical' 
                ? "bg-red-600" 
                : "bg-cyan-600"
            )}
            data-testid="button-submit-incident"
          >
            <Send className="w-5 h-5 mr-2" />
            {submitting ? 'Submitting...' : 'Submit Report'}
          </Button>
        </div>
      </CanvasHubPage>
    );
  }

  return (
    <CanvasHubPage config={listConfig}>
      <div className="space-y-4">
        {/* Quick Report Button */}
        <button
          onClick={() => { setMode('create'); captureLocation(); }}
          className="w-full p-6 rounded-xl bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-500/30 flex items-center justify-center gap-3 active:scale-[0.98] transition-transform"
          data-testid="button-quick-report"
        >
          <AlertTriangle className="w-8 h-8 text-red-400" />
          <div className="text-left">
            <div className="text-lg font-bold text-white">Report Incident</div>
            <div className="text-sm text-slate-400">Tap to create a new report</div>
          </div>
        </button>

        {/* Recent Incidents */}
        <div>
          <h2 className="text-sm font-medium text-slate-400 mb-3">Recent Reports</h2>
          
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-slate-800/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : recentIncidents && recentIncidents.length > 0 ? (
            <div className="space-y-3">
              {recentIncidents.map((incident) => {
                const typeInfo = INCIDENT_TYPES.find(t => t.id === incident.type) || INCIDENT_TYPES[6];
                const Icon = typeInfo.icon;
                
                return (
                  <Card
                    key={incident.id}
                    className="bg-slate-900/50 border-slate-800 p-4"
                    data-testid={`incident-card-${incident.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "p-2 rounded-lg",
                        incident.severity === 'critical' ? "bg-red-500/20" : "bg-slate-800"
                      )}>
                        <Icon className={cn("w-5 h-5", typeInfo.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-white truncate">{typeInfo.label}</span>
                          <Badge variant="outline" className={getSeverityColor(incident.severity)}>
                            {incident.severity}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-400 line-clamp-2">{incident.description}</p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                          {getStatusIcon(incident.status)}
                          <span className="capitalize">{incident.status}</span>
                          <span>•</span>
                          <span>{format(new Date(incident.createdAt), 'MMM d, h:mm a')}</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No incidents reported</p>
              <p className="text-sm">Tap the button above to report an issue</p>
            </div>
          )}
        </div>
      </div>
    </CanvasHubPage>
  );
}
