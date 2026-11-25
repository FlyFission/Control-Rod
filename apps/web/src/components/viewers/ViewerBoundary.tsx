import { Component, type ReactNode } from "react";

/**
 * A viewer that fails (a damaged PDF, an odd Word file) shows a plain line and the raw link, and
 * never takes the panel or the page down with it.
 */
export class ViewerBoundary extends Component<{ href: string; resetKey: string; children: ReactNode }, { failed: boolean; key: string }> {
  override state = { failed: false, key: this.props.resetKey };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  static getDerivedStateFromProps(props: { resetKey: string }, state: { failed: boolean; key: string }) {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <p className="error">
        This file could not be shown here.{" "}
        <a href={this.props.href} className="link" target="_blank" rel="noreferrer">
          Open it in a new tab
        </a>
        .
      </p>
    );
  }
}
