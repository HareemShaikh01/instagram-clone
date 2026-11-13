"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { SessionProvider } from "@/components/session";
import { BadgeProvider, MobileBottomNav, MobileTopBar, Sidebar, SuggestionsPanel } from "@/components/nav";
import { CreatePostModal } from "@/components/create-post-modal";
import { CreateStoryModal } from "@/components/create-story-modal";

type CreateApi = {
  openPost: () => void;
  openStory: () => void;
};

const CreateCtx = createContext<CreateApi>({ openPost: () => {}, openStory: () => {} });

export function useCreate() {
  return useContext(CreateCtx);
}

function Shell({ children }: { children: React.ReactNode }) {
  const [postOpen, setPostOpen] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);

  const openPost = useCallback(() => setPostOpen(true), []);
  const openStory = useCallback(() => setStoryOpen(true), []);

  return (
    <CreateCtx.Provider value={{ openPost, openStory }}>
      <BadgeProvider>
        <Sidebar onCreate={openPost} />
        <div className="lg:pl-60">
          <MobileTopBar />
          <div className="mx-auto flex max-w-[1000px] items-start gap-10 px-3 py-4 sm:px-6 lg:max-w-[975px]">
            <main className="min-w-0 flex-1 pb-16 lg:pb-4">{children}</main>
            <div className="sticky top-6 hidden xl:block">
              <SuggestionsPanel />
            </div>
          </div>
        </div>
        <MobileBottomNav onCreate={openStory} />
        <CreatePostModal open={postOpen} onClose={() => setPostOpen(false)} />
        <CreateStoryModal open={storyOpen} onClose={() => setStoryOpen(false)} />
      </BadgeProvider>
    </CreateCtx.Provider>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider requireAuth>
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}
