"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { Button, Input, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { SessionProvider } from "@/components/session";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/api/auth/login", { body: { identifier, password } });
      const next = params.get("next");
      router.replace(next && next.startsWith("/") ? next : "/");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Input
        label="Username or email"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        autoComplete="username"
        autoFocus
        required
      />
      <div className="relative">
        <Input
          label="Password"
          type={showPw ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className="pr-10"
        />
        <button
          type="button"
          aria-label={showPw ? "Hide password" : "Show password"}
          onClick={() => setShowPw((v) => !v)}
          className="absolute top-8 right-2 text-muted hover:text-fg"
        >
          {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={busy || !identifier || !password}>
        {busy && <Spinner size={16} className="text-white" />} Log in
      </Button>
      <Link href="/forgot-password" className="mt-1 text-center text-xs text-accent hover:underline">
        Forgot password?
      </Link>
      <div className="mt-4 border-t border-line pt-4 text-center text-sm">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-semibold text-accent hover:underline" onClick={() => toast("info", "Create your account")}>
          Sign up
        </Link>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <SessionProvider guestOnly>
      <Suspense fallback={<div className="text-center"><Spinner /></div>}>
        <LoginForm />
      </Suspense>
    </SessionProvider>
  );
}
