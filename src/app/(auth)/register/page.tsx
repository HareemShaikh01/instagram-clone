"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiClientError, uploadMedia } from "@/lib/api-client";
import { Button, Input } from "@/components/ui";
import { SessionProvider } from "@/components/session";
import { Avatar } from "@/components/ui";
import { UserRoundPlus } from "lucide-react";

type FieldErrors = Record<string, string>;

function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: "", username: "", email: "", password: "" });
  const [avatar, setAvatar] = useState<{ id: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { media } = await uploadMedia(file);
      setAvatar({ id: media.id, url: media.url });
    } catch (err) {
      setErrors((er) => ({ ...er, avatar: err instanceof ApiClientError ? err.message : "Upload failed" }));
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      await api("/api/auth/register", { body: { ...form, avatarMediaId: avatar?.id } });
      router.replace("/");
    } catch (err) {
      if (err instanceof ApiClientError) {
        const fieldMap: Record<string, string> = {
          invalid_username: "username",
          username_taken: "username",
          email_taken: "email",
          invalid_email: "email",
          weak_password: "password",
          invalid_full_name: "fullName",
        };
        const field = fieldMap[err.code];
        setErrors(field ? { [field]: err.message } : { form: err.message });
      } else {
        setErrors({ form: "Registration failed" });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="mb-1 flex flex-col items-center gap-2">
        <label className="cursor-pointer" aria-label="Choose profile picture">
          <Avatar src={avatar?.url ?? null} alt="Profile picture preview" size={72} />
          <input type="file" accept="image/*" className="hidden" onChange={pickAvatar} />
        </label>
        <span className="text-sm text-accent hover:underline cursor-pointer" onClick={() => document.querySelector<HTMLInputElement>('input[type=file]')?.click()}>
          {uploading ? "Uploading…" : avatar ? "Change photo" : "Add a profile picture"}
        </span>
        {errors.avatar && <span className="text-xs text-danger">{errors.avatar}</span>}
      </div>
      <Input label="Full name" value={form.fullName} onChange={set("fullName")} required error={errors.fullName} />
      <Input label="Username" value={form.username} onChange={set("username")} required error={errors.username} autoComplete="off" />
      <Input label="Email" type="email" value={form.email} onChange={set("email")} required error={errors.email} autoComplete="email" />
      <Input
        label="Password"
        type="password"
        value={form.password}
        onChange={set("password")}
        required
        error={errors.password}
        autoComplete="new-password"
      />
      <p className="text-xs text-muted">At least 8 characters, with a letter and a number.</p>
      {errors.form && <p className="text-sm text-danger">{errors.form}</p>}
      <Button type="submit" disabled={busy}>
        <UserRoundPlus size={16} /> Create account
      </Button>
      <div className="mt-4 border-t border-line pt-4 text-center text-sm">
        Have an account?{" "}
        <Link href="/login" className="font-semibold text-accent hover:underline">
          Log in
        </Link>
      </div>
    </form>
  );
}

export default function RegisterPage() {
  return (
    <SessionProvider guestOnly>
      <RegisterForm />
    </SessionProvider>
  );
}
