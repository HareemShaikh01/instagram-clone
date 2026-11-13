"use client";

import { createContext, useContext } from "react";

export type CreateApi = {
  openPost: () => void;
  openStory: () => void;
};

export const CreateCtx = createContext<CreateApi>({ openPost: () => {}, openStory: () => {} });

export function useCreate() {
  return useContext(CreateCtx);
}
