import { Component, type ReactNode } from "react";

import { ErrorScreen } from "@/components/ErrorScreen";

interface Props {
  children: ReactNode;
}

interface State {
  error: unknown;
  failed: boolean;
}

/**
 * The last line of defense: if anything above or beside the pages fails to draw, the window shows
 * the error screen instead of going blank. Pages have their own boundaries through the router.
 */
export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { error: undefined, failed: false };

  static getDerivedStateFromError(error: unknown): State {
    return { error, failed: true };
  }

  override render() {
    return this.state.failed ? <ErrorScreen error={this.state.error} /> : this.props.children;
  }
}
