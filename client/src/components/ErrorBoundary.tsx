import { Component, ErrorInfo, ReactNode } from 'react';
import { GenericErrorPage } from '@/components/universal-error-page';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

/**
 * Error Boundary Component
 * 
 * Catches React errors and displays CoAIleague-branded fallback UI
 * using the unified UniversalErrorPage system.
 * Platform staff see detailed diagnostics for debugging.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error Boundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
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
      return (
        <GenericErrorPage
          title="Something went wrong"
          message="We encountered an unexpected error. Our team has been notified and is working on a fix."
          errorDetails={this.formatErrorDetails()}
        />
      );
    }

    return this.props.children;
  }
}
