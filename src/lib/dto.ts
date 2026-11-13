import type { SessionUser } from "./session";
import type { SessionUserDTO } from "./types";

export function avatarUrl(mediaId: string | null): string | null {
  return mediaId ? `/api/media/${mediaId}` : null;
}

export function toSessionUserDTO(u: SessionUser): SessionUserDTO {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    email: u.email,
    avatarUrl: avatarUrl(u.avatarMediaId),
    isPrivate: u.isPrivate,
    bio: u.bio,
    website: u.website,
  };
}
