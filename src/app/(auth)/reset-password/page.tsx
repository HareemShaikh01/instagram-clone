"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, ApiClientError } from "@/lib/api-client";
import { Button, Input } from "@/components/ui";
import { SessionProvider } from "@/components/session";

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/password/reset", { body: { token, password, confirmPassword: confirm } });
      router.replace("/login");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-danger">This reset link is missing its token.</p>
        <Link href="/forgot-password" className="text-accent hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Input label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus autoComplete="new-password" />
      <Input label="Confirm new password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={busy}>
        Reset password
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <SessionProvider guestOnly>
      <Suspense fallback={null}>
        <ResetForm />
      </Suspense>
    </SessionProvider>
  );
}
