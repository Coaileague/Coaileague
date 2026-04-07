import { Component, type ReactNode, type ErrorInfo } from 'react';

const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || "CoAIleague";

// ============================================================================
// GLOBAL ERROR BOUNDARY
// ============================================================================
// Catches unhandled React errors and provides a simple fallback UI
// IMPORTANT: This component must NOT use any hooks since it renders outside
// of React context providers when an error is caught
// NOTE: Uses hsl(var(--xxx)) for all colors since CSS custom properties defined
// in :root are still available even when React providers have crashed.

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

function SimpleErrorFallback({ errorMessage }: { errorMessage?: string }) {
  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      backgroundColor: 'hsl(var(--background))',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{
        maxWidth: '32rem',
        width: '100%',
        textAlign: 'center',
        padding: '2rem',
        border: '1px solid hsl(var(--border))',
        borderRadius: '0.5rem',
        backgroundColor: 'hsl(var(--card))'
      }}>
        <div style={{
          width: '4rem',
          height: '4rem',
          margin: '0 auto 1.5rem',
          backgroundColor: 'hsl(var(--destructive) / 0.15)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <span style={{ fontSize: '2rem', color: 'hsl(var(--destructive))' }}>!</span>
        </div>
        
        <h1 style={{
          fontSize: '1.5rem',
          fontWeight: 'bold',
          color: 'hsl(var(--foreground))',
          marginBottom: '0.5rem'
        }}>
          Something Went Wrong
        </h1>
        
        <p style={{
          fontSize: '0.875rem',
          color: 'hsl(var(--muted-foreground))',
          marginBottom: '1.5rem'
        }}>
          An unexpected error occurred. Please refresh the page to try again.
        </p>

        {errorMessage && (
          <details style={{
            textAlign: 'left',
            marginBottom: '1.5rem',
            padding: '0.75rem',
            backgroundColor: 'hsl(var(--muted))',
            borderRadius: '0.375rem',
            fontSize: '0.75rem'
          }}>
            <summary style={{ cursor: 'pointer', color: 'hsl(var(--foreground))' }}>
              Error Details
            </summary>
            <pre style={{
              marginTop: '0.5rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: 'hsl(var(--destructive))'
            }}>
              {errorMessage}
            </pre>
          </details>
        )}
        
        <div style={{
          display: 'flex',
          gap: '0.75rem',
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={() => window.location.href = '/'}
            style={{
              padding: '0.5rem 1.5rem',
              backgroundColor: 'hsl(var(--primary))',
              color: 'hsl(var(--primary-foreground))',
              border: 'none',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: 'pointer'
            }}
            data-testid="button-go-home"
          >
            Go Home
          </button>
          <button
            onClick={() => window.history.back()}
            style={{
              padding: '0.5rem 1.5rem',
              backgroundColor: 'hsl(var(--secondary))',
              color: 'hsl(var(--secondary-foreground))',
              border: 'none',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: 'pointer'
            }}
            data-testid="button-go-back"
          >
            Go Back
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1.5rem',
              backgroundColor: 'hsl(var(--accent))',
              color: 'hsl(var(--accent-foreground))',
              border: 'none',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: 'pointer'
            }}
            data-testid="button-refresh"
          >
            Refresh Page
          </button>
        </div>
        
        <p style={{
          marginTop: '1rem',
          fontSize: '0.75rem',
          color: 'hsl(var(--muted-foreground))'
        }}>
          {PLATFORM_NAME} - Autonomous Workforce Management
        </p>
      </div>
    </div>
  );
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

    // Auto-reload on chunk/dynamic-import failures (e.g. 503 from Vite)
    const msg = error?.message ?? '';
    const name = error?.name ?? '';
    const isChunkError =
      name === 'ChunkLoadError' ||
      msg.includes('dynamically imported module') ||
      msg.includes('Failed to fetch dynamically') ||
      msg.includes('Loading chunk') ||
      msg.includes('Importing a module script failed') ||
      /Loading CSS chunk \d+ failed/.test(msg);
    if (isChunkError) {
      console.warn('[GlobalErrorBoundary] Chunk load failure detected — reloading in 1.5s');
      setTimeout(() => {
        try { window.location.reload(); } catch { window.location.href = '/'; }
      }, 1500);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return <SimpleErrorFallback errorMessage={this.state.error?.message} />;
    }

    return this.props.children;
  }
}
