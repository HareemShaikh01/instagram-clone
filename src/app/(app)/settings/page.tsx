"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, LogOut, Trash2 } from "lucide-react";
import { api, ApiClientError, uploadMedia } from "@/lib/api-client";
import type { SessionUser } from "@/components/session";
import { useSession } from "@/components/session";
import { Avatar, Button, Input, Spinner, Textarea } from "@/components/ui";
import { Modal, ModalHeader } from "@/components/modal";
import { useToast } from "@/components/toast";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-elevated p-5">
      <h2 className="text-base font-bold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const { user, setUser, logout } = useSession();
  const toast = useToast();
  const router = useRouter();

  if (!user) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={24} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-5 pb-8">
      <h1 className="text-xl font-bold">Settings</h1>
      <ProfileSection user={user} onSaved={setUser} />
      <EmailSection user={user} />
      <PasswordSection />
      <DangerSection user={user} onDeleted={() => { setUser(null); router.replace("/register"); }} onLogout={() => void logout()} />
    </div>
  );
}

function ProfileSection({ user, onSaved }: { user: SessionUser; onSaved: (u: SessionUser) => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState(user.fullName);
  const [username, setUsername] = useState(user.username);
  const [bio, setBio] = useState(user.bio ?? "");
  const [website, setWebsite] = useState(user.website ?? "");
  const [isPrivate, setIsPrivate] = useState(user.isPrivate);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  const changed =
    fullName !== user.fullName ||
    username !== user.username ||
    bio !== (user.bio ?? "") ||
    website !== (user.website ?? "") ||
    isPrivate !== user.isPrivate;

  const save = useCallback(async () => {
    const nextErrors: Record<string, string | null> = {};
    if (fullName.trim().length === 0) nextErrors.fullName = "Name is required";
    if (username.trim().length < 3) nextErrors.username = "At least 3 characters";
    if (bio.length > 200) nextErrors.bio = "At most 200 characters";
    if (website.trim().length > 200) nextErrors.website = "At most 200 characters";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const res = await api<{ user: SessionUser }>("/api/users/me", {
        method: "PATCH",
        body: { fullName: fullName.trim(), username: username.trim().toLowerCase(), bio: bio.trim(), website: website.trim(), isPrivate },
      });
      onSaved(res.user);
      toast("success", "Profile updated");
    } catch (e) {
      if (e instanceof ApiClientError && e.code === "username_taken") {
        setErrors({ username: e.message });
      } else {
        toast("error", e instanceof Error ? e.message : "Could not save profile");
      }
    } finally {
      setSaving(false);
    }
  }, [fullName, username, bio, website, isPrivate, onSaved, toast]);

  const pickAvatar = useCallback(async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("error", "Avatars must be images");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast("error", "Images must be under 20 MB");
      return;
    }
    setUploading(true);
    try {
      const { media } = await uploadMedia(file);
      const res = await api<{ user: SessionUser }>("/api/users/me", {
        method: "PATCH",
        body: { avatarMediaId: media.id },
      });
      onSaved(res.user);
      toast("success", "Profile photo updated");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [onSaved, toast]);

  return (
    <Section title="Edit profile" description="How you appear on Instagram.">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={() => void pickAvatar()} aria-label="Choose a profile photo" />
      <div className="flex items-center gap-4">
        <Avatar src={user.avatarUrl} alt={user.username} size={64} />
        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} className="mr-1" />} Change photo
        </Button>
      </div>
      <div className="mt-4 space-y-4">
        <Input label="Name" value={fullName} onChange={(e) => setFullName(e.target.value)} error={errors.fullName} maxLength={60} />
        <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} error={errors.username} maxLength={30} autoCapitalize="none" />
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Bio</span>
          <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={200} />
          <span className="mt-1 block text-right text-xs text-muted">{bio.length}/200</span>
        </label>
        <Input label="Website" value={website} onChange={(e) => setWebsite(e.target.value)} error={errors.website} maxLength={200} type="url" placeholder="https://" />
        <label className="flex items-center justify-between rounded-lg bg-surface px-3 py-2.5">
          <span>
            <span className="block text-sm font-semibold">Private account</span>
            <span className="block text-xs text-muted">Only approved followers can see your posts and stories.</span>
          </span>
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="h-5 w-5 shrink-0 accent-(--accent)"
            aria-label="Private account"
          />
        </label>
        <div className="flex justify-end">
          <Button onClick={save} disabled={!changed || saving}>
            {saving ? <Spinner size={14} /> : "Save changes"}
          </Button>
        </div>
      </div>
    </Section>
  );
}

function EmailSection({ user }: { user: SessionUser }) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/users/me/email", { method: "POST", body: { email: email.trim(), password } });
      toast("success", "Email updated");
      setEmail("");
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change email");
    } finally {
      setBusy(false);
    }
  }, [email, password, toast]);

  return (
    <Section title="Email" description={`Currently ${user.email}.`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Input label="New email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <Input label="Current password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end">
          <Button type="submit" disabled={busy || !email.trim() || !password}>
            {busy ? <Spinner size={14} /> : "Update email"}
          </Button>
        </div>
      </form>
    </Section>
  );
}

function PasswordSection() {
  const toast = useToast();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || newPassword.length < 8) {
      setError("At least 8 characters with a letter and a number");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/api/users/me/password", { method: "POST", body: { currentPassword, newPassword, confirmPassword } });
      toast("success", "Password changed");
      setCurrent("");
      setNew("");
      setConfirm("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change password");
    } finally {
      setBusy(false);
    }
  }, [currentPassword, newPassword, confirmPassword, toast]);

  return (
    <Section title="Password" description="Changing your password signs out other sessions.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Input label="Current password" type="password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        <Input label="New password" type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} autoComplete="new-password" />
        <Input label="Confirm new password" type="password" value={confirmPassword} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end">
          <Button type="submit" disabled={busy || !currentPassword || !newPassword || !confirmPassword}>
            {busy ? <Spinner size={14} /> : "Change password"}
          </Button>
        </div>
      </form>
    </Section>
  );
}

function DangerSection({ user, onDeleted, onLogout }: { user: SessionUser; onDeleted: () => void; onLogout: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destroy = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/users/me", { method: "DELETE", body: { password } });
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete account");
      setBusy(false);
    }
  }, [password, onDeleted]);

  return (
    <Section title="Account actions">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onLogout}>
          <LogOut size={14} className="mr-1" /> Log out
        </Button>
        <Button variant="danger" onClick={() => setOpen(true)}>
          <Trash2 size={14} className="mr-1" /> Delete account
        </Button>
      </div>

      <Modal open={open} onClose={() => { setOpen(false); setError(null); }} labelledBy="delete-account-title">
        <ModalHeader title="Delete your account?" onClose={() => { setOpen(false); setError(null); }} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void destroy();
          }}
        >
          <div className="space-y-4 p-5">
            <p className="text-sm text-muted">
              @{user.username}, this permanently removes your profile, posts, messages and followers. This cannot be undone.
            </p>
            <Input
              label="Confirm your password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={error}
              autoComplete="current-password"
            />
            <Button type="submit" variant="danger" disabled={busy || !password} className="w-full">
              {busy ? <Spinner size={14} /> : "Permanently delete my account"}
            </Button>
          </div>
        </form>
      </Modal>
    </Section>
  );
}
