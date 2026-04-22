import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught', error, info.componentStack)
  }

  reset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset)
      return (
        <div role="alert" className="min-h-screen flex items-center justify-center p-8 bg-background">
          <div className="max-w-lg w-full border border-border rounded-lg p-6 bg-card">
            <h1 className="text-xl font-semibold mb-2">Something went wrong.</h1>
            <p className="text-sm text-muted-foreground mb-4">
              An unexpected error crashed this view. The rest of the app is still running.
            </p>
            <pre className="text-xs text-red-400 bg-muted/20 rounded p-3 overflow-auto max-h-48 whitespace-pre-wrap font-mono">
              {this.state.error.message}
            </pre>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={this.reset}
                className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-3 py-1.5 rounded-md border border-border text-sm"
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
