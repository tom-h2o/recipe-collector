import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center p-8 text-center gap-3">
          <p className="font-semibold text-zinc-700 dark:text-zinc-300">Something went wrong displaying this recipe.</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="text-sm text-sk-primary hover:underline"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
