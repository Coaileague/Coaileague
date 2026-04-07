import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, retry: () => void) => ReactNode;
  componentName?: string;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
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

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      isChunkError: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      isChunkError: isChunkLoadError(error),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });

    const chunkErr = isChunkLoadError(error);
    const errorDetails = {
      component: this.props.componentName ?? 'Unknown',
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
      isChunkError: chunkErr,
    };

    console.error('[ErrorBoundary] caught an error:', errorDetails);
    this.props.onError?.(error, errorInfo);

    if (chunkErr && !this._reloadScheduled) {
      this._reloadScheduled = true;
      console.warn('[ErrorBoundary] Chunk load failure detected — reloading page in 1.5s');
      setTimeout(() => {
        try {
          window.location.reload();
        } catch {
          window.location.href = '/';
        }
      }, 1500);
    }
  }

  handleRetry = () => {
    this._reloadScheduled = false;
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      isChunkError: false,
    });
  };

  handleReload = () => {
    try {
      window.location.reload();
    } catch {
      window.location.href = '/';
    }
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleRetry);
      }

      if (this.state.isChunkError) {
        return (
          <div className="flex items-center justify-center min-h-screen bg-background p-4" data-testid="error-boundary-chunk">
            <div className="max-w-sm w-full space-y-4 text-center">
              <div className="flex justify-center">
                <div className="p-3 bg-primary/10 rounded-full">
                  <RotateCcw className="w-8 h-8 text-primary animate-spin" />
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-foreground">Reloading…</h2>
                <p className="text-sm text-muted-foreground">
                  A resource failed to load. The page will reload automatically.
                </p>
              </div>
              <Button onClick={this.handleReload} size="lg" className="gap-2" data-testid="button-reload-now">
                <RotateCcw className="w-4 h-4" />
                Reload Now
              </Button>
            </div>
          </div>
        );
      }

      return (
        <div className="flex items-center justify-center min-h-screen bg-background p-4">
          <div className="max-w-md w-full space-y-6 text-center">
            <div className="flex justify-center">
              <div className="p-3 bg-destructive/10 rounded-full">
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">
                Something went wrong
              </h1>
              <p className="text-muted-foreground">
                {this.props.componentName
                  ? `The ${this.props.componentName} encountered an error and could not display.`
                  : 'An unexpected error occurred. Please try again or contact support if the problem persists.'
                }
              </p>
            </div>

            <div className="bg-muted/50 rounded-md p-4 text-left">
              <details className="text-sm">
                <summary className="cursor-pointer font-mono text-muted-foreground hover:text-foreground transition-colors">
                  Error details
                </summary>
                <pre className="mt-2 text-xs overflow-auto max-h-48 text-destructive whitespace-pre-wrap break-words">
                  {this.state.error.message}
                  {this.state.errorInfo?.componentStack && (
                    <>
                      {'\n\n'}Component Stack:
                      {this.state.errorInfo.componentStack}
                    </>
                  )}
                </pre>
              </details>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button
                onClick={this.handleRetry}
                size="lg"
                className="gap-2"
                data-testid="button-error-retry"
              >
                <RotateCcw className="w-4 h-4" />
                Try Again
              </Button>
              <Button
                onClick={() => (window.location.href = '/')}
                variant="outline"
                size="lg"
                data-testid="button-error-home"
              >
                Go Home
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
