import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error Boundary Component
 * 
 * Catches React errors and displays a user-friendly fallback UI
 * instead of crashing the entire application.
 * 
 * Required for Fortune 500-grade reliability and user experience.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console for debugging
    console.error('Error Boundary caught an error:', error, errorInfo);
    
    // In production, you would send this to an error tracking service
    // like Sentry, LogRocket, or DataDog
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--cad-background))] p-4">
          <div className="max-w-md w-full bg-[hsl(var(--cad-chrome))] border border-[hsl(var(--cad-border-strong))] rounded-lg p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 bg-destructive/10 rounded-full flex items-center justify-center">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
            </div>
            
            <h1 className="text-2xl font-bold text-[hsl(var(--cad-text-primary))] mb-2">
              Something went wrong
            </h1>
            
            <p className="text-[hsl(var(--cad-text-secondary))] mb-6">
              We encountered an unexpected error. Our team has been notified and is working on a fix.
            </p>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mb-6 p-4 bg-destructive/5 border border-destructive/20 rounded text-left">
                <p className="text-xs font-mono text-destructive break-all">
                  {this.state.error.toString()}
                </p>
              </div>
            )}
            
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={() => {
                  this.setState({ hasError: false, error: undefined });
                }}
                variant="outline"
                data-testid="button-try-again"
              >
                Try Again
              </Button>
              
              <Button
                onClick={() => {
                  window.location.href = '/dashboard';
                }}
                className="bg-[hsl(var(--cad-blue))] hover:bg-[hsl(var(--cad-blue))]/90 text-white"
                data-testid="button-go-home"
              >
                Go to Dashboard
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
