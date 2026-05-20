import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { PageShell } from "@/components/layout/page_shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import {
  getSandboxTerms,
  submitSandboxReport,
  getSandboxReportStatus,
  type SandboxReportInput,
} from "@/api/endpoints/sandbox";
import { isSandboxUiEnabled } from "@/lib/sandbox";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

const REASON_OPTIONS: Array<{ value: SandboxReportInput["reason"]; label: string }> = [
  { value: "abuse", label: "Abuse or harassment" },
  { value: "pii_leak", label: "Personal information leak" },
  { value: "illegal_content", label: "Illegal content" },
  { value: "spam", label: "Spam" },
  { value: "bug", label: "Bug or broken behavior" },
  { value: "other", label: "Other" },
];

function ReportForm() {
  const [form, setForm] = useState<SandboxReportInput>({
    reason: "abuse",
    description: "",
    entity_id: "",
    url: "",
    reporter_contact: "",
  });
  const [submission, setSubmission] = useState<{
    report_id: string;
    access_token: string;
  } | null>(null);

  const mutation = useMutation({
    mutationFn: submitSandboxReport,
    onSuccess: (res) => {
      setSubmission({ report_id: res.report_id, access_token: res.access_token });
      toast.success("Report submitted. Save your access token below to check status.");
      setForm({ reason: "abuse", description: "", entity_id: "", url: "", reporter_contact: "" });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Submission failed";
      toast.error(msg);
    },
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.description.trim()) {
      toast.error("Description is required");
      return;
    }
    const payload: SandboxReportInput = { ...form };
    if (!payload.entity_id?.trim()) delete payload.entity_id;
    if (!payload.url?.trim()) delete payload.url;
    if (!payload.reporter_contact?.trim()) delete payload.reporter_contact;
    mutation.mutate(payload);
  }

  return (
    <Card id="report">
      <CardHeader>
        <CardTitle>Report an issue</CardTitle>
        <p className="text-sm text-muted-foreground">
          Reports are forwarded to the Neotoma team via the same pipeline that handles product
          feedback, with IP and reporter contact redacted before long-term storage. Keep the
          access token — it's the only way to follow up later.
        </p>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Select
              value={form.reason}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, reason: value as SandboxReportInput["reason"] }))
              }
            >
              <SelectTrigger id="reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASON_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">What happened?</Label>
            <Textarea
              id="description"
              required
              rows={4}
              placeholder="Describe the content or behavior. Include URL or entity ID if relevant."
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, description: e.target.value }))
              }
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="entity_id">Entity ID (optional)</Label>
              <Input
                id="entity_id"
                value={form.entity_id || ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, entity_id: e.target.value }))
                }
                placeholder="ent_..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="url">URL (optional)</Label>
              <Input
                id="url"
                value={form.url || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))}
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contact">Reporter contact (optional)</Label>
            <Input
              id="contact"
              value={form.reporter_contact || ""}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, reporter_contact: e.target.value }))
              }
              placeholder="email or handle — redacted in storage"
            />
          </div>

          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Submitting…" : "Submit report"}
          </Button>
        </form>

        {submission ? (
          <Alert className="mt-6">
            <div className="space-y-2 text-sm">
              <p className="font-medium">Report submitted</p>
              <p>
                Report ID: <code className="font-mono">{submission.report_id}</code>
              </p>
              <p>
                Access token:{" "}
                <code className="font-mono break-all">{submission.access_token}</code>
              </p>
              <p className="text-muted-foreground">
                Save this token privately. Use it in the status checker below to see resolution
                updates. The token is not retrievable later.
              </p>
            </div>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ReportStatusLookup() {
  const [token, setToken] = useState("");
  const [submittedToken, setSubmittedToken] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["sandbox-report-status", submittedToken],
    queryFn: () => getSandboxReportStatus(submittedToken!),
    enabled: isApiUrlConfigured() && !!submittedToken,
    retry: false,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Check report status</CardTitle>
        <p className="text-sm text-muted-foreground">
          Paste the access token you received when submitting a report.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (token.trim()) setSubmittedToken(token.trim());
          }}
        >
          <Input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="access token"
          />
          <Button type="submit">Check</Button>
        </form>
        {statusQuery.isPending && submittedToken ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : null}
        {statusQuery.isError ? (
          <p className="text-sm text-red-600">
            {(statusQuery.error as Error)?.message || "Could not load status"}
          </p>
        ) : null}
        {statusQuery.data ? (
          <div className="space-y-1 text-sm">
            <div>
              Status: <Badge variant="outline">{statusQuery.data.status}</Badge>
            </div>
            <div className="text-muted-foreground">
              Submitted {new Date(statusQuery.data.submitted_at).toLocaleString()}
            </div>
            {statusQuery.data.next_check_suggested_at ? (
              <div className="text-muted-foreground">
                Suggested next check:{" "}
                {new Date(statusQuery.data.next_check_suggested_at).toLocaleString()}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TermsCard() {
  const termsQuery = useQuery({
    queryKey: ["sandbox-terms"],
    queryFn: getSandboxTerms,
    retry: false,
    enabled: isApiUrlConfigured(),
  });

  return (
    <Card id="terms">
      <CardHeader>
        <CardTitle>Terms of use</CardTitle>
        {termsQuery.data ? (
          <p className="text-xs text-muted-foreground">
            Version {termsQuery.data.version} — effective{" "}
            {new Date(termsQuery.data.effective_date).toLocaleDateString()}. Weekly reset:{" "}
            {termsQuery.data.weekly_reset_utc}.
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        {termsQuery.isPending ? (
          <p className="text-sm text-muted-foreground">Loading terms…</p>
        ) : termsQuery.isError ? (
          <p className="text-sm text-red-600">
            Terms could not be loaded from the server.
          </p>
        ) : (
          <div className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
            {termsQuery.data?.content_markdown}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SandboxPage() {
  if (!isSandboxUiEnabled()) {
    return (
      <PageShell title="Sandbox">
        <Alert>
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5" aria-hidden />
            <span>
              This page is only active on the public sandbox deployment
              (<code>sandbox.neotoma.io</code>). Run a local Inspector without{" "}
              <code>VITE_NEOTOMA_SANDBOX_UI=1</code> to hide it.
            </span>
          </div>
        </Alert>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Sandbox"
      description="Terms of use and abuse reporting for the public sandbox."
    >
      <div className="flex flex-col gap-6">
        <TermsCard />
        <ReportForm />
        <ReportStatusLookup />
      </div>
    </PageShell>
  );
}
