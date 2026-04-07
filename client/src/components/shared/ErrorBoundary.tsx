import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  componentName?: string;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `[ErrorBoundary] ${this.props.componentName ?? 'Unknown'} crashed:`,
      error,
      errorInfo
    );
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div
          data-testid="error-boundary-fallback"
          className="flex flex-col items-center justify-center p-8
            rounded-md border border-destructive/30 bg-destructive/5 min-h-[200px]"
        >
          <div className="text-destructive font-semibold text-lg mb-2">
            Something went wrong
          </div>
          <div className="text-destructive/80 text-sm mb-4 text-center max-w-md">
            {this.props.componentName
              ? `The ${this.props.componentName} encountered an error and could not display.`
              : 'This section encountered an error and could not display.'
            }
          </div>
          <button
            data-testid="error-boundary-retry"
            onClick={this.handleRetry}
            className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md
              text-sm font-medium hover-elevate active-elevate-2"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
