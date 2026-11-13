"use client";

import { useState } from "react";
import Link from "next/link";
import { api, ApiClientError } from "@/lib/api-client";
import { Button, Input } from "@/components/ui";
import { SessionProvider } from "@/components/session";

function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<{ resetUrl?: string; note?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ resetUrl?: string; note?: string }>("/api/auth/password/forgot", {
        body: { email },
      });
      setSent(res);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-line p-5 text-sm">
        <p className="font-semibold">Check your email</p>
        <p className="text-muted">
          If that address belongs to an account, a reset link is on its way.
        </p>
        {sent.resetUrl && (
          <p className="rounded-md bg-surface p-3 text-xs break-all">
            <span className="font-semibold">Local testing:</span> email delivery is not configured here, so use this link:{" "}
            <Link href={sent.resetUrl.replace(/^https?:\/\/[^/]+/, "")} className="text-accent underline">
              {sent.resetUrl}
            </Link>
          </p>
        )}
        <Link href="/login" className="text-accent hover:underline">
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-sm text-muted">Enter your email and we will send you a reset link.</p>
      <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={busy || !email}>
        Send reset link
      </Button>
      <Link href="/login" className="text-center text-xs text-accent hover:underline">
        Back to login
      </Link>
    </form>
  );
}

export default function ForgotPasswordPage() {
  return (
    <SessionProvider guestOnly>
      <ForgotForm />
    </SessionProvider>
  );
}
