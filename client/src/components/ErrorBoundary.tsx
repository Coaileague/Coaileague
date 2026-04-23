import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  componentName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isChunkError: boolean;
}

function isChunkLoadError(error: Error): boolean {
  const msg = error?.message ?? '';
  const name = error?.name ?? '';
  return (
    name === 'ChunkLoadError' ||
    msg.includes('dynamically imported module') ||
    msg.includes('Failed to fetch dynamically') ||
    msg.includes('Loading chunk') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('failed to fetch') ||
    /Loading CSS chunk \d+ failed/.test(msg) ||
    /Failed to load module script/.test(msg)
  );
}

export class ErrorBoundary extends Component<Props, State> {
  private _reloadScheduled = false;

  public state: State = {
    hasError: false,
    error: null,
    isChunkError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, isChunkError: isChunkLoadError(error) };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);

    if (isChunkLoadError(error) && !this._reloadScheduled) {
      this._reloadScheduled = true;
      console.warn('[ErrorBoundary] Chunk load failure — reloading in 1.5s');
      setTimeout(() => {
        try { window.location.reload(); } catch { window.location.href = '/'; }
      }, 1500);
    }
  }

  private handleRetry = () => {
    this._reloadScheduled = false;
    this.setState({ hasError: false, error: null, isChunkError: false });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      if (this.state.isChunkError) {
        return (
          <div className="flex items-center justify-center min-h-[400px] p-4" data-testid="error-boundary-chunk">
            <Card className="w-full max-w-md border-primary/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <RefreshCw className="h-5 w-5 animate-spin" />
                  Reloading…
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  A new version of the application is available. The page will reload automatically.
                </p>
              </CardContent>
              <CardFooter>
                <Button
                  onClick={this.handleRetry}
                  className="w-full gap-2"
                  data-testid="button-reload-now"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reload Now
                </Button>
              </CardFooter>
            </Card>
          </div>
        );
      }

      return (
        <div className="flex items-center justify-center min-h-[400px] p-4">
          <Card className="w-full max-w-md border-destructive/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                Application Error
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Something went wrong while rendering this component. We have logged the error and our team has been notified.
              </p>
              {this.state.error && (
                <pre className="mt-4 p-2 bg-muted rounded text-xs overflow-auto max-h-[100px]">
                  {this.state.error.message}
                </pre>
              )}
            </CardContent>
            <CardFooter>
              <Button 
                onClick={this.handleRetry}
                variant="outline" 
                className="w-full gap-2"
                data-testid="button-retry-error"
              >
                <RefreshCw className="h-4 w-4" />
                Reload Application
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
