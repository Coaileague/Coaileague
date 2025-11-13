import { Component, type ReactNode, type ErrorInfo } from 'react';

// ============================================================================
// GLOBAL ERROR BOUNDARY
// ============================================================================
// Catches unhandled React errors and provides simple fallback UI
// Note: This boundary handles catastrophic errors (e.g., provider mount failures)
// For in-app error reporting with ServiceFailureDialog, use within components
// that have ServiceHealthProvider available

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class GlobalErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console for debugging
    console.error('GlobalErrorBoundary caught error:', error, errorInfo);
    
    // Update state with error details
    this.setState({
      error,
      errorInfo,
    });

    // Log error details to console for debugging
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
    });
  }

  handleReset = () => {
    // Clear error state and attempt recovery
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    
    // Reload page to reset app state
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Show custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Minimal fallback UI (dialog disabled in error boundary to avoid hook violations)
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4" data-testid="error-boundary-fallback">
          <div className="max-w-md text-center">
            <div className="mb-4 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <svg
                  className="h-8 w-8 text-destructive"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  data-testid="error-icon"
                >
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
            <h2 className="mb-2 text-xl font-semibold text-foreground" data-testid="error-title">
              Something went wrong
            </h2>
            <p className="mb-6 text-sm text-muted-foreground" data-testid="error-message">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <p className="mb-6 text-xs text-muted-foreground">
              Error details have been logged. Please refresh the page or contact support if the issue persists.
            </p>
            <button
              onClick={this.handleReset}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              data-testid="button-reset"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
