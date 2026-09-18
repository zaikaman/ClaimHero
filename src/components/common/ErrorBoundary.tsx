import { Component, ErrorInfo, ReactNode } from "react";
import { ArrowClockwise, House, WarningCircle } from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("ErrorBoundary caught an unhandled component error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleReload = (): void => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorMessage = this.state.error?.message || "An unexpected rendering error occurred.";
      const errorStack = this.state.error?.stack;

      return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center select-none animate-fadeIn">
          <div className="max-w-lg w-full p-8 rounded-2xl border border-destructive/40 bg-card/80 backdrop-blur-xl shadow-2xl flex flex-col items-center space-y-6">
            <div className="size-16 rounded-2xl border border-destructive/40 bg-destructive/10 flex items-center justify-center text-destructive shadow-inner">
              <WarningCircle className="size-8" weight="bold" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2">
                <Badge variant="destructive" className="text-[11px] font-mono">
                  Runtime Error
                </Badge>
                <span className="text-xs font-mono text-muted-foreground">Sentinel Shield</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground font-sans">
                Workspace Render Interrupted
              </h1>
              <p className="text-xs text-muted-foreground leading-relaxed">
                A component encountered an unhandled error during rendering. The application session was protected from an unhandled crash.
              </p>
            </div>

            <div className="w-full text-left space-y-2">
              <div className="p-3 rounded-lg bg-background/90 border border-border/70 font-mono text-xs text-destructive break-all max-h-32 overflow-y-auto">
                {errorMessage}
              </div>
              {errorStack && (
                <details className="text-left text-[11px] text-muted-foreground">
                  <summary className="cursor-pointer font-mono hover:text-foreground transition-colors">
                    View technical stack trace
                  </summary>
                  <pre className="mt-2 p-3 rounded-lg bg-background/90 border border-border/70 font-mono text-[10px] text-muted-foreground overflow-x-auto max-h-40 whitespace-pre-wrap">
                    {errorStack}
                  </pre>
                </details>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 w-full pt-2">
              <Button
                onClick={this.handleReset}
                className="w-full sm:w-1/2 h-9 text-xs gap-2 cursor-pointer font-medium"
              >
                <ArrowClockwise className="size-3.5" />
                <span>Try Again</span>
              </Button>
              <Button
                onClick={this.handleReload}
                variant="outline"
                className="w-full sm:w-1/2 h-9 text-xs gap-2 cursor-pointer border-border/70"
              >
                <House className="size-3.5 text-muted-foreground" />
                <span>Reload App</span>
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
