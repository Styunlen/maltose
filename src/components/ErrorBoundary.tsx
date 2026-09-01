import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Generic React error boundary. Catches render errors in the subtree so a
 * single bad piece of data (e.g. a malformed comment node) can't unmount the
 * whole island. CommentSection uses this so a render exception in one comment
 * bubble no longer makes the entire comment section disappear.
 */
export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="error-boundary-fallback">
            评论区加载出错了，刷新页面重试
          </div>
        )
      );
    }
    return this.props.children;
  }
}
