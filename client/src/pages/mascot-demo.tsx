/**
 * Mascot Demo Page - Interactive showcase of the CoAITwinMascot
 * 
 * This page demonstrates all mascot modes and allows interactive testing.
 */

import { useState, useCallback, useEffect } from 'react';
import { CoAITwinMascot, MascotMode, MODE_COLORS, MODE_LABELS } from '@/components/coai-twin-mascot';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ArrowLeft, Play, Pause, RotateCcw, Zap } from 'lucide-react';
import { Link } from 'wouter';

const ALL_MODES: MascotMode[] = [
  'IDLE',
  'SEARCHING',
  'THINKING',
  'ANALYZING',
  'CODING',
  'LISTENING',
  'UPLOADING',
  'SUCCESS',
  'ERROR'
];

export default function MascotDemoPage() {
  const [currentMode, setCurrentMode] = useState<MascotMode>('IDLE');
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [autoPlayIndex, setAutoPlayIndex] = useState(0);

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

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-primary" />
                Gemini Agent Mascot
              </h1>
              <p className="text-sm text-muted-foreground">
                Interactive twin-star mascot with state-reactive animations
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="hidden sm:flex">
            AI-Powered Visual Feedback
          </Badge>
        </div>

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
    ERROR: 'Erratic shaking with red tint, representing system fault or error state.'
  };
  return descriptions[mode];
}
