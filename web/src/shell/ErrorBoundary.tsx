import { Component, type ErrorInfo, type ReactNode } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@modelsphere/ui";
import { useT } from "./i18n";

type State = { error: Error | null };

/** Catches render errors so a single bad component cannot blank the console. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(cause: unknown): State {
    return {
      error: cause instanceof Error ? cause : new Error(String(cause)),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The fallback only shows the message; the stack goes where it can be copied.
    console.error("render failed", error, info.componentStack);
  }

  reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <PageError error={error} onReset={this.reset} />;
  }
}

function PageError({ error, onReset }: { error: Error; onReset: () => void }) {
  const t = useT("shell");
  return (
    <div role="alert" className="flex min-h-64 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("error.title")}</CardTitle>
          <CardDescription>{t("error.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="break-all font-mono text-xs text-destructive">
            {error.message}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onReset}>{t("error.retry")}</Button>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
            >
              {t("error.reload")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
