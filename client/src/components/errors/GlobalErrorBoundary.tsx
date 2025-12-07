import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Error500Page } from '@/components/universal-error-page';

// ============================================================================
// GLOBAL ERROR BOUNDARY
// ============================================================================
// Catches unhandled React errors and provides CoAIleague-branded fallback UI
// Uses UniversalErrorPage for consistent branding with AI Brain integration
// Platform staff see detailed diagnostics for debugging

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
    console.error('GlobalErrorBoundary caught error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
    });
  }

  formatErrorDetails(): string {
    const { error, errorInfo } = this.state;
    if (!error) return '';
    
    const parts: string[] = [];
    parts.push(`Error: ${error.message}`);
    parts.push(`Timestamp: ${new Date().toISOString()}`);
    parts.push(`URL: ${window.location.href}`);
    
    if (error.stack) {
      parts.push(`\nStack Trace:\n${error.stack}`);
    }
    
    if (errorInfo?.componentStack) {
      parts.push(`\nComponent Stack:${errorInfo.componentStack}`);
    }
    
    return parts.join('\n');
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Error500Page errorDetails={this.formatErrorDetails()} />
      );
    }

    return this.props.children;
  }
}
