"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Compass,
  Heart,
  Home,
  LogOut,
  MessageCircle,
  Moon,
  PlusSquare,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import { api, formatCount, useApi, useInterval } from "@/lib/api-client";
import { useSession } from "@/components/session";
import { Avatar, Skeleton } from "@/components/ui";
import { useToast } from "@/components/toast";
import { DropdownMenu, MenuItem } from "@/components/dropdown";
import type { SuggestedUserDTO } from "@/lib/types";

/* ------------------------------------------------------------------ badges */

type Badges = { notifications: number; messages: number };
const BadgeCtx = createContext<Badges>({ notifications: 0, messages: 0 });

export function useBadges() {
  return useContext(BadgeCtx);
}

export function BadgeProvider({ children }: { children: React.ReactNode }) {
  const [badges, setBadges] = useState<Badges>({ notifications: 0, messages: 0 });

  const poll = () => {
    api<{ unreadCount: number }>("/api/notifications?limit=1")
      .then((d) => setBadges((b) => ({ ...b, notifications: d.unreadCount })))
      .catch(() => {});
    api<{ conversations: Array<{ unreadCount: number }> }>("/api/messages/conversations?limit=1")
      .then((d) =>
        setBadges((b) => ({
          ...b,
          messages: d.conversations.reduce((sum, c) => sum + c.unreadCount, 0),
        })),
      )
      .catch(() => {});
  };

  useInterval(poll, 5000);
  useEffect(poll, []);

  return <BadgeCtx.Provider value={badges}>{children}</BadgeCtx.Provider>;
}

/* ------------------------------------------------------------------ theme */

export function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("ig-theme", next ? "dark" : "light");
    setDark(next);
  };
  return { dark, toggle };
}

/* ------------------------------------------------------------------ sidebar */

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/messages", label: "Messages", icon: MessageCircle, badge: "messages" as const },
  { href: "/notifications", label: "Notifications", icon: Heart, badge: "notifications" as const },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ onCreate }: { onCreate: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useSession();
  const badges = useBadges();
  const { dark, toggle } = useTheme();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-bg px-3 py-5 lg:flex xl:w-64">
      <Link href="/" className="mb-6 px-2 text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Segoe Script', 'Brush Script MT', cursive" }}>
        Instagram
      </Link>
      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon, badge }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          const count = badge ? badges[badge] : 0;
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex items-center gap-4 rounded-lg px-2 py-3 text-sm hover:bg-(--hover) ${active ? "font-bold" : ""}`}
            >
              <span className="relative">
                <Icon size={24} fill={active ? "currentColor" : "none"} />
                {count > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-4 text-white">
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </span>
              {label}
            </Link>
          );
        })}
        <button
          onClick={onCreate}
          className="flex items-center gap-4 rounded-lg px-2 py-3 text-sm hover:bg-(--hover)"
        >
          <PlusSquare size={24} /> Create
        </button>
        <button onClick={toggle} className="flex items-center gap-4 rounded-lg px-2 py-3 text-sm hover:bg-(--hover)">
          {dark ? <Sun size={24} /> : <Moon size={24} />} {dark ? "Light" : "Dark"} mode
        </button>
        {user && (
          <Link
            href={`/profile/${user.username}`}
            className={`flex items-center gap-4 rounded-lg px-2 py-3 text-sm hover:bg-(--hover) ${pathname === `/profile/${user.username}` ? "font-bold" : ""}`}
          >
            <Avatar src={user.avatarUrl} alt={user.username} size={24} />
            Profile
          </Link>
        )}
      </nav>
      <DropdownMenu
        trigger={() => (
          <span className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-(--hover)">
            <Avatar src={user?.avatarUrl ?? null} alt={user?.username ?? "Account"} size={32} />
            <span className="min-w-0 flex-1 truncate font-medium">{user?.username}</span>
            <LogOut size={16} className="text-muted" />
          </span>
        )}
      >
        {(close) => (
          <MenuItem
            danger
            onClick={() => {
              close();
              void logout();
            }}
          >
            Log out
          </MenuItem>
        )}
      </DropdownMenu>
    </aside>
  );
}

/* ------------------------------------------------------------------ mobile chrome */

export function MobileTopBar() {
  const { user } = useSession();
  const badges = useBadges();
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-bg px-4 py-3 lg:hidden">
      <Link href="/" className="text-xl font-semibold tracking-tight" style={{ fontFamily: "'Segoe Script', 'Brush Script MT', cursive" }}>
        Instagram
      </Link>
      <div className="flex items-center gap-4">
        <Link href="/notifications" aria-label="Notifications" className="relative">
          <Heart size={24} />
          {badges.notifications > 0 && (
            <span className="absolute -top-1.5 -right-2 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-4 text-white">
              {badges.notifications > 99 ? "99+" : badges.notifications}
            </span>
          )}
        </Link>
        <Link href="/messages" aria-label="Messages" className="relative">
          <MessageCircle size={24} />
          {badges.messages > 0 && (
            <span className="absolute -top-1.5 -right-2 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-4 text-white">
              {badges.messages > 99 ? "99+" : badges.messages}
            </span>
          )}
        </Link>
        {user && (
          <Link href={`/profile/${user.username}`} aria-label="Your profile">
            <Avatar src={user.avatarUrl} alt={user.username} size={26} />
          </Link>
        )}
      </div>
    </header>
  );
}

export function MobileBottomNav({ onCreate }: { onCreate: () => void }) {
  const pathname = usePathname();
  const { user } = useSession();
  const item = (href: string, label: string, content: React.ReactNode) => (
    <Link
      href={href}
      aria-label={label}
      className={`flex-1 py-2.5 text-center ${href === "/" ? pathname === "/" : pathname.startsWith(href) ? "opacity-100" : "opacity-60"}`}
    >
      {content}
    </Link>
  );
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-bg lg:hidden" aria-label="Primary">
      {item("/", "Home", <Home size={24} className="mx-auto" />)}
      {item("/search", "Search", <Search size={24} className="mx-auto" />)}
      <button aria-label="Create" onClick={onCreate} className="flex-1 py-2.5">
        <PlusSquare size={24} className="mx-auto" />
      </button>
      {item("/explore", "Explore", <Compass size={24} className="mx-auto" />)}
      {user && item(`/profile/${user.username}`, "Profile", <Avatar src={user.avatarUrl} alt={user.username} size={24} />)}
    </nav>
  );
}

/* ------------------------------------------------------------------ right rail */

export function SuggestionsPanel() {
  const { user } = useSession();
  const { data, loading } = useApi<{ suggestions: SuggestedUserDTO[] }>("/api/suggestions");

  return (
    <aside className="w-80 shrink-0 pt-2">
      {user && (
        <div className="mb-5 flex items-center gap-3">
          <Link href={`/profile/${user.username}`}>
            <Avatar src={user.avatarUrl} alt={user.username} size={44} />
          </Link>
          <div className="min-w-0">
            <Link href={`/profile/${user.username}`} className="block truncate text-sm font-semibold hover:underline">
              {user.username}
            </Link>
            <span className="block truncate text-sm text-muted">{user.fullName}</span>
          </div>
        </div>
      )}
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-semibold text-muted">Suggested for you</span>
      </div>
      {loading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      )}
      {data && (
        <ul className="flex flex-col gap-3">
          {data.suggestions.map((s) => (
            <SuggestionRow key={s.id} suggestion={s} />
          ))}
          {data.suggestions.length === 0 && <li className="text-sm text-muted">No suggestions right now.</li>}
        </ul>
      )}
      <p className="mt-8 text-xs text-muted">Instagram Clone · built with Next.js, Drizzle & Postgres</p>
    </aside>
  );
}

export function SuggestionRow({ suggestion }: { suggestion: SuggestedUserDTO }) {
  const toast = useToast();
  const [state, setState] = useState<"none" | "following" | "requested">(suggestion.isFollowing ? "following" : suggestion.hasPendingRequest ? "requested" : "none");
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      if (state === "none") {
        const res = await api<{ status: "following" | "requested" }>(`/api/users/${suggestion.username}/follow`, { method: "POST" });
        setState(res.status);
      } else {
        await api(`/api/users/${suggestion.username}/follow`, { method: "DELETE" });
        setState("none");
      }
    } catch {
      toast("error", "Could not update follow");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center gap-3">
      <Link href={`/profile/${suggestion.username}`}>
        <Avatar src={suggestion.avatarUrl} alt={suggestion.username} size={34} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/profile/${suggestion.username}`} className="block truncate text-sm font-semibold hover:underline">
          {suggestion.username}
        </Link>
        <span className="block truncate text-xs text-muted">
          {suggestion.followerCount > 0 ? `${formatCount(suggestion.followerCount)} followers` : "New here"}
        </span>
      </div>
      <button
        onClick={() => void toggle()}
        disabled={busy}
        className={`text-xs font-semibold ${state === "none" ? "text-accent hover:text-accent-dark" : "hover:text-fg text-muted"}`}
      >
        {state === "none" ? "Follow" : state === "requested" ? "Requested" : "Following"}
      </button>
    </li>
  );
}

