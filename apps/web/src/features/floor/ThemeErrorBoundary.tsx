import { Component, type ReactNode } from "react";
export class ThemeErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <div role="alert" className="floor-notice">
        The scene could not be displayed. Your work is unchanged.{" "}
        <button
          type="button"
          className="floor-btn"
          onClick={this.props.onReset}
        >
          Use Plain Floor
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
