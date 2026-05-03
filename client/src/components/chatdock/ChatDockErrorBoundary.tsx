/**
 * ChatDockErrorBoundary — Wave 7 / Task 3
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps ChatDock so a single bad message or rendering error does not
 * white-screen the entire platform for a guard in the field.
 * Shows a minimal recovery UI with a reconnect button.
 */

import { Component, type ReactNode, type ErrorInfo } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  roomId?: string;
}

interface State {
  hasError: boolean;
  errorMessage?: string;
}

export class ChatDockErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Non-fatal — log to console, never alert or crash the parent
    console.error("[ChatDock] Render error caught by boundary:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
          <div className="text-4xl">💬</div>
          <p className="text-sm font-medium text-foreground">Chat encountered an issue</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            {this.props.roomId ? `Room: ${this.props.roomId}. ` : ""}
            This room can recover without reloading the page.
          </p>
          <Button size="sm" variant="outline" onClick={this.handleReset}>
            Reconnect to Chat
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
