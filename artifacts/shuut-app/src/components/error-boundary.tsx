import {
  Component,
  useState,
  type ComponentType,
  type FormEvent,
  type ErrorInfo,
  type ReactNode,
} from 'react';

export interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  FallbackComponent?: ComponentType<ErrorFallbackProps>;
  /** Changing this clears a caught error. Pass the route to recover on navigation. */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === 'string') {
    return new Error(value);
  }
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error(String(value));
  }
}

function DefaultFallback({ error, resetError }: ErrorFallbackProps) {
  const [email, setEmail] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [reportError, setReportError] = useState('');

  const reloadApp = () => {
    resetError();
    window.location.reload();
  };

  const reportIssue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsReporting(true);
    setReportError('');

    const technicalContext = [
      'An app error was reported from the SHÜÜT recovery screen.',
      '',
      `Page: ${window.location.href}`,
      `Time: ${new Date().toISOString()}`,
      `Browser: ${window.navigator.userAgent}`,
      `Error: ${error.message || 'Unknown application error'}`,
    ].join('\n');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: 'Issue',
          lastName: 'Reporter',
          email: email.trim(),
          message: technicalContext,
          consent: true,
          website: '',
        }),
      });

      if (!response.ok) {
        throw new Error('Issue report request failed');
      }

      setReportSent(true);
    } catch {
      setReportError(
        'We could not send your report. Please email admin@shuut.me instead.',
      );
    } finally {
      setIsReporting(false);
    }
  };

  return (
    <main className="min-h-[100dvh] w-full bg-white px-6 py-12 text-gray-950">
      <div className="mx-auto flex min-h-[calc(100dvh-6rem)] w-full max-w-md flex-col justify-center">
        <p className="mb-12 text-center text-5xl font-extrabold tracking-tight">
          SHÜÜT
        </p>

        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">
            We hit a problem
          </p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight">
            Sorry about that
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
            SHÜÜT could not load this page. Reload the app, or report the issue
            below so we can investigate.
          </p>
        </div>

        {/* Dev only: messages can carry API responses and other internals. */}
        {import.meta.env.DEV ? (
          <pre className="mt-6 overflow-x-auto rounded-lg bg-gray-100 p-3 text-left text-xs text-gray-800">
            {error.message || String(error)}
          </pre>
        ) : null}

        <button
          type="button"
          onClick={reloadApp}
          className="mt-7 w-full rounded-lg bg-gray-950 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          Reload SHÜÜT
        </button>

        <div className="my-8 h-px bg-gray-200" />

        {reportSent ? (
          <div
            role="status"
            className="rounded-xl border border-green-200 bg-green-50 p-5 text-center"
          >
            <h2 className="font-bold text-green-950">
              Thanks for reporting that issue
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-green-800">
              We have received your report and will investigate.
            </p>
          </div>
        ) : (
          <form onSubmit={reportIssue}>
            <h2 className="text-lg font-bold">Report this issue</h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">
              Enter your email so we can follow up if we need more information.
            </p>
            <label className="mt-4 block text-sm font-medium text-gray-800">
              Email address
              <input
                required
                type="email"
                maxLength={254}
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 h-12 w-full rounded-lg border border-gray-300 bg-white px-4 text-base shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </label>
            <p className="mt-2 text-xs leading-relaxed text-gray-500">
              Your email will only be used to respond to this report.
            </p>

            {reportError ? (
              <p role="alert" className="mt-3 text-sm font-medium text-red-700">
                {reportError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isReporting}
              className="mt-4 w-full rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-950 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isReporting ? 'Sending report…' : 'Send issue report'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: toError(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(
      'ErrorBoundary caught an error:',
      toError(error),
      info.componentStack,
    );
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (
      this.state.error !== null &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.resetError();
    }
  }

  resetError = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) {
      return this.props.children;
    }
    const Fallback = this.props.FallbackComponent ?? DefaultFallback;
    return <Fallback error={error} resetError={this.resetError} />;
  }
}
