export type MediaDTO = {
  id: string;
  kind: "image" | "video";
  url: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
};

export type UserSummary = {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
  isPrivate: boolean;
};

export type SuggestedUserDTO = UserSummary & {
  followerCount: number;
  isFollowing: boolean;
  hasPendingRequest: boolean;
};

export type CommentDTO = {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  parentId: string | null;
  author: UserSummary;
  likeCount: number;
  likedByMe: boolean;
  replyCount: number;
};

export type PostDTO = {
  id: string;
  caption: string;
  location: string | null;
  createdAt: string;
  author: UserSummary;
  media: MediaDTO[];
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
  latestComment: CommentDTO | null;
  nextCursor?: string | undefined;
};

export type StoryDTO = {
  id: string;
  kind: "image" | "video" | "text";
  media: MediaDTO | null;
  bgColor: string | null;
  text: string | null;
  caption: string | null;
  overlayText: string | null;
  createdAt: string;
  expiresAt: string;
  author?: UserSummary;
  seenByMe: boolean;
  viewCount: number;
};

export type StoryGroupDTO = {
  author: UserSummary;
  allSeen: boolean;
  stories: StoryDTO[];
};

export type ConversationDTO = {
  id: string;
  participants: UserSummary[];
  lastMessageAt: string | null;
  lastMessageBody: string | null;
  lastMessageSenderId: string | null;
  unreadCount: number;
};

export type MessageDTO = {
  id: string;
  conversationId: string;
  sender: UserSummary;
  body: string | null;
  media: MediaDTO | null;
  createdAt: string;
  seen: boolean;
};

export type NotificationDTO = {
  id: string;
  type:
    | "like"
    | "comment"
    | "follow"
    | "follow_request"
    | "follow_accept"
    | "mention"
    | "message";
  actor: UserSummary;
  postId: string | null;
  commentId: string | null;
  conversationId: string | null;
  postThumbUrl: string | null;
  snippet: string | null;
  readAt: string | null;
  createdAt: string;
};

export type ProfileDTO = UserSummary & {
  bio: string;
  website: string | null;
  postCount: number;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  isFollowedBy: boolean;
  hasPendingRequest: boolean;
  hasIncomingRequest: boolean;
  isSelf: boolean;
  isBlocked: boolean;
};

export type SessionUserDTO = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  isPrivate: boolean;
  bio: string;
  website: string | null;
};
