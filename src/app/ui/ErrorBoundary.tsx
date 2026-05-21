import React, { Component, ErrorInfo, ReactNode } from "react";
import { colors, spacing, typography, radius } from "@/theme/tokens";
import { Button } from "@/app/ui/Button";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
    this.props.onError?.(error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: spacing["3xl"],
            textAlign: "center",
            minHeight: 200,
          }}
        >
          <div
            style={{
              padding: spacing.xl,
              background: "rgba(239, 68, 68, 0.1)",
              border: `1px solid rgba(239, 68, 68, 0.3)`,
              borderRadius: radius.lg,
              maxWidth: 400,
            }}
          >
            <div style={{ fontSize: typography.size.xl, fontWeight: typography.weight.bold, color: colors.status.error, marginBottom: spacing.sm }}>
              Something went wrong
            </div>
            <div style={{ fontSize: typography.size.sm, color: colors.text.secondary, marginBottom: spacing.lg }}>
              {this.state.error?.message || "An unexpected error occurred."}
            </div>
            <Button onClick={this.handleReset}>Try Again</Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
