import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export default class SidepanelErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "The side panel hit an unexpected error.",
    };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error("Sidepanel render error", error, errorInfo);
  }

  private handleReload = () => {
    this.setState({ hasError: false, message: "" });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="sidepanel-shell sidepanel-shell--auth">
        <section className="hero-card auth-hero-card">
          <p className="eyebrow">IndiaCircle</p>
          <h1>Side panel needs a refresh</h1>
          <p className="hero-copy">
            A temporary rendering issue interrupted this view. Reload the panel to continue.
          </p>
        </section>

        <section className="placeholder-card auth-card">
          <div className="connection-error-banner">
            {this.state.message || "The side panel hit an unexpected error."}
          </div>
          <button className="auth-submit-button" onClick={this.handleReload} type="button">
            Reload side panel
          </button>
        </section>
      </main>
    );
  }
}
