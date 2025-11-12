import { useState } from "react";
import { AutoForceAFLogo } from "@/components/autoforce-af-logo";
import { 
  ForceFlowBar, 
  AFCoreScan, 
  DataStreamIndicator, 
  HexGridLoader 
} from "@/components/loading-indicators";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function LogoShowcaseV2() {
  const [, setLocation] = useLocation();
  const [forceProgress, setForceProgress] = useState(0);
  const [afProgress, setAfProgress] = useState(0);
  const [dataProgress, setDataProgress] = useState(0);
  const [hexActive, setHexActive] = useState(false);

  const runForceFlow = () => {
    setForceProgress(0);
    const interval = setInterval(() => {
      setForceProgress(prev => {
        const next = prev + Math.random() * 10;
        if (next >= 100) {
          clearInterval(interval);
          return 100;
        }
        return next;
      });
    }, 200);
  };

  const runAfScan = () => {
    setAfProgress(0);
    const interval = setInterval(() => {
      setAfProgress(prev => {
        const next = prev + Math.random() * 5;
        if (next >= 100) {
          clearInterval(interval);
          return 100;
        }
        return next;
      });
    }, 100);
  };

  const runDataStream = () => {
    setDataProgress(0);
    const interval = setInterval(() => {
      setDataProgress(prev => {
        const next = prev + 2;
        if (next >= 100) {
          clearInterval(interval);
          return 100;
        }
        return next;
      });
    }, 50);
  };

  const runHexLoader = () => {
    setHexActive(true);
    setTimeout(() => setHexActive(false), 5000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-5xl font-bold mb-2">
              <span className="text-foreground">AUTO</span>
              <span 
                className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent"
              >
                FORCE
              </span>
              <span className="text-foreground">™</span>
            </h1>
            <p className="text-xl text-muted-foreground">Polished Dynamic Indicators V2</p>
          </div>
          <Button variant="outline" onClick={() => setLocation("/")}>
            Back to Home
          </Button>
        </div>

        {/* Logo Variants */}
        <Card>
          <CardHeader>
            <CardTitle>AF Logo Variants</CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Icon Only */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Icon Only (with spinning A)</h3>
              <div className="flex items-center gap-8 flex-wrap">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Small</p>
                  <AutoForceAFLogo variant="icon" size="sm" animated />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Medium</p>
                  <AutoForceAFLogo variant="icon" size="md" animated />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Large</p>
                  <AutoForceAFLogo variant="icon" size="lg" animated />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-2">With F (Complete)</p>
                  <AutoForceAFLogo variant="icon" size="lg" animated showF />
                </div>
              </div>
            </div>

            {/* Full Logo */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Full Logo (Icon + Text)</h3>
              <div className="space-y-4">
                <AutoForceAFLogo variant="full" size="md" animated />
                <AutoForceAFLogo variant="full" size="md" animated showF />
              </div>
            </div>

            {/* Wordmark */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Wordmark Only</h3>
              <AutoForceAFLogo variant="wordmark" />
            </div>
          </CardContent>
        </Card>

        {/* Force Flow Bar */}
        <Card>
          <CardHeader>
            <CardTitle>1. Force Flow (Linear Progress Bar)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ForceFlowBar progress={forceProgress} />
            <Button onClick={runForceFlow}>Start Force Flow</Button>
          </CardContent>
        </Card>

        {/* AF Core Scan */}
        <Card>
          <CardHeader>
            <CardTitle>2. AF Core Scan (Radial Progress with A→AF)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-center gap-8">
              <AFCoreScan progress={afProgress} size="lg" />
              <div>
                <p className="text-4xl font-bold mb-2" style={{ color: '#F57A43' }}>
                  {Math.round(afProgress)}%
                </p>
                <p className="text-muted-foreground">
                  {afProgress >= 100 ? 'AF CORE: SECURE FORCE LOCK ESTABLISHED' : 'SCANNING AUTO-FORCE CORE...'}
                </p>
              </div>
            </div>
            <Button onClick={runAfScan}>Start AF Core Scan</Button>
          </CardContent>
        </Card>

        {/* Data Stream */}
        <Card>
          <CardHeader>
            <CardTitle>3. Data Stream (Liquid Wave Fill)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <DataStreamIndicator progress={dataProgress} height="h-24" />
            <Button onClick={runDataStream}>Start Data Stream</Button>
          </CardContent>
        </Card>

        {/* Hex Grid Loader */}
        <Card>
          <CardHeader>
            <CardTitle>4. Hex Grid Loader (Sequential Pulse)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <HexGridLoader active={hexActive} />
            <Button onClick={runHexLoader} disabled={hexActive}>
              {hexActive ? 'Running...' : 'Initiate Hex Scan Cycle'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
