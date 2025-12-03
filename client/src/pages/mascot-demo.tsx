/**
 * Mascot Demo Page - SUPPORT STAFF ONLY
 * 
 * Internal testing tool for CoAITwinMascot development.
 * Features:
 * - Live preview of all mascot modes and animations
 * - Hot-reload capability for testing changes
 * - Suggestion system for code edits and improvements
 * - NOT for public or end-user access
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { CoAITwinMascot, MascotMode, MODE_COLORS, MODE_LABELS } from '@/components/coai-twin-mascot';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, ArrowLeft, Play, Pause, RotateCcw, Zap, RefreshCw, Code, MessageSquare, HeadphonesIcon, AlertTriangle, CheckCircle } from 'lucide-react';
import { Link } from 'wouter';
import { SupportStaffRoute } from '@/components/support-staff-route';
import { useToast } from '@/hooks/use-toast';

const ALL_MODES: MascotMode[] = [
  'IDLE',
  'SEARCHING',
  'THINKING',
  'ANALYZING',
  'CODING',
  'LISTENING',
  'UPLOADING',
  'SUCCESS',
  'ERROR',
  'CELEBRATING',
  'ADVISING',
  'HOLIDAY'
];

function MascotDemoContent() {
  const [currentMode, setCurrentMode] = useState<MascotMode>('IDLE');
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [autoPlayIndex, setAutoPlayIndex] = useState(0);
  const [suggestion, setSuggestion] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [refreshKey, setRefreshKey] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    if (!isAutoPlaying) return;

    const interval = setInterval(() => {
      setAutoPlayIndex((prev) => {
        const next = (prev + 1) % ALL_MODES.length;
        setCurrentMode(ALL_MODES[next]);
        return next;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [isAutoPlaying]);

  const handleModeChange = useCallback((mode: MascotMode) => {
    setCurrentMode(mode);
    setIsAutoPlaying(false);
    setAutoPlayIndex(ALL_MODES.indexOf(mode));
  }, []);

  const toggleAutoPlay = useCallback(() => {
    setIsAutoPlaying((prev) => !prev);
  }, []);

  const resetDemo = useCallback(() => {
    setCurrentMode('IDLE');
    setIsAutoPlaying(false);
    setAutoPlayIndex(0);
  }, []);

  const runWorkflowDemo = useCallback(() => {
    setIsAutoPlaying(false);
    const workflow: MascotMode[] = ['SEARCHING', 'ANALYZING', 'THINKING', 'CODING', 'SUCCESS'];
    let step = 0;

    const runStep = () => {
      if (step >= workflow.length) return;
      setCurrentMode(workflow[step]);
      step++;
      if (step < workflow.length) {
        setTimeout(runStep, 2500);
      }
    };

    runStep();
  }, []);

  const handleHotReload = useCallback(() => {
    setRefreshKey(prev => prev + 1);
    setLastRefresh(new Date());
    toast({
      title: "Preview Refreshed",
      description: "Mascot component has been hot-reloaded with latest changes.",
    });
  }, [toast]);

  const handleSubmitSuggestion = useCallback(async () => {
    if (!suggestion.trim()) {
      toast({
        title: "Empty Suggestion",
        description: "Please enter a suggestion before submitting.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const response = await fetch('/api/mascot/suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          suggestion: suggestion.trim(),
          currentMode,
          timestamp: new Date().toISOString()
        }),
        credentials: 'include'
      });
      
      if (response.ok) {
        toast({
          title: "Suggestion Submitted",
          description: "Your feedback has been recorded for review.",
        });
        setSuggestion('');
      } else {
        throw new Error('Failed to submit');
      }
    } catch (error) {
      toast({
        title: "Submission Failed",
        description: "Could not submit suggestion. It will be logged locally.",
        variant: "destructive",
      });
      console.log('[MascotDemo] Suggestion (local log):', { suggestion, currentMode });
    }
  }, [suggestion, currentMode, toast]);

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <HeadphonesIcon className="h-6 w-6 text-primary" />
                Mascot Testing Lab
              </h1>
              <p className="text-sm text-muted-foreground">
                Support Staff Internal Tool - Test animations before production
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Internal Only
            </Badge>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleHotReload}
              data-testid="button-hot-reload"
              className="gap-1"
            >
              <RefreshCw className="h-4 w-4" />
              Hot Reload
            </Button>
          </div>
        </div>
        
        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardContent className="py-3 flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-muted-foreground">
              Last refreshed: {lastRefresh.toLocaleTimeString()} • 
              Changes to mascot code will appear after hot reload
            </span>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between">
                <span>Live Preview</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleAutoPlay}
                    data-testid="button-toggle-autoplay"
                  >
                    {isAutoPlaying ? (
                      <>
                        <Pause className="h-4 w-4 mr-1" /> Pause
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-1" /> Auto
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={runWorkflowDemo}
                    data-testid="button-workflow-demo"
                  >
                    <Zap className="h-4 w-4 mr-1" /> Workflow
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={resetDemo}
                    data-testid="button-reset"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              </CardTitle>
              <CardDescription>
                Touch or drag to interact with the twins
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[400px] sm:h-[500px] rounded-b-lg overflow-hidden">
                <CoAITwinMascot
                  key={refreshKey}
                  mode={currentMode}
                  onModeChange={handleModeChange}
                  showControls={true}
                  className="w-full h-full"
                />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Quick Actions</CardTitle>
                <CardDescription>Click to switch modes instantly</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {ALL_MODES.map((mode) => (
                  <Button
                    key={mode}
                    variant={currentMode === mode ? 'default' : 'outline'}
                    className="w-full justify-start gap-2"
                    onClick={() => handleModeChange(mode)}
                    data-testid={`button-mode-${mode.toLowerCase()}`}
                  >
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: MODE_COLORS[mode] }}
                    />
                    {mode}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {MODE_LABELS[mode]}
                    </span>
                  </Button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Mode Info</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{
                        backgroundColor: `${MODE_COLORS[currentMode]}20`,
                        boxShadow: `0 0 20px ${MODE_COLORS[currentMode]}40`
                      }}
                    >
                      <div
                        className="w-3 h-3 rounded-full animate-pulse"
                        style={{ backgroundColor: MODE_COLORS[currentMode] }}
                      />
                    </div>
                    <div>
                      <div className="font-semibold">{currentMode}</div>
                      <div className="text-sm text-muted-foreground">
                        {MODE_LABELS[currentMode]}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {getModeDescription(currentMode)}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Submit Feedback / Suggestions
            </CardTitle>
            <CardDescription>
              Share ideas for code edits, new animations, bug fixes, or improvements
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Describe the issue, suggestion, or code change you'd like to propose. Include specific details about which mode, animation, or behavior needs modification..."
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              className="min-h-[100px]"
              data-testid="input-suggestion"
            />
            <div className="flex justify-between items-center">
              <p className="text-xs text-muted-foreground">
                Suggestions are logged for development review
              </p>
              <Button 
                onClick={handleSubmitSuggestion}
                data-testid="button-submit-suggestion"
                className="gap-2"
              >
                <Code className="h-4 w-4" />
                Submit Suggestion
              </Button>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Integration Guide</CardTitle>
            <CardDescription>
              How to use the CoAITwinMascot in your components
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
              <code>{`import { CoAITwinMascot } from '@/components/coai-twin-mascot';
import { useMascotMode } from '@/hooks/use-mascot-mode';

function MyComponent() {
  const mode = useMascotMode({
    isLoading: query.isLoading,
    isError: query.isError,
    isSuccess: query.isSuccess
  });

  return (
    <CoAITwinMascot 
      mode={mode}
      className="h-64 w-64"
    />
  );
}`}</code>
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function getModeDescription(mode: MascotMode): string {
  const descriptions: Record<MascotMode, string> = {
    IDLE: 'The twins gently float in a figure-8 pattern, representing a calm, ready state.',
    SEARCHING: 'One twin remains stationary (user anchor) while the other orbits wide, scanning like radar.',
    THINKING: 'Both twins spin rapidly around the center, representing active computation.',
    ANALYZING: 'Twins form a constellation with connection lines, representing neural network analysis.',
    CODING: 'Grid-based step movement in a matrix pattern, representing code generation.',
    LISTENING: 'Vertical audio waveform movement, representing voice/audio input processing.',
    UPLOADING: 'Spiral upward motion with particle streams falling, representing data transfer.',
    SUCCESS: 'Twins merge to center with celebration particles, representing task completion.',
    ERROR: 'Erratic shaking with red tint, representing system fault or error state.',
    CELEBRATING: 'Extra celebratory confetti-like bursts with pulsing orbital motion.',
    ADVISING: 'Professional smooth orbit emanating wisdom particles.',
    HOLIDAY: 'Festive bouncy movement with joyful colorful particles.'
  };
  return descriptions[mode];
}

export default function MascotDemoPage() {
  return (
    <SupportStaffRoute>
      <MascotDemoContent />
    </SupportStaffRoute>
  );
}
