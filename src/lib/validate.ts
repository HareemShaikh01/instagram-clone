import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be at most 30 characters")
  .regex(/^[a-z0-9._]+$/, "Username may only contain letters, numbers, periods and underscores")
  .refine((v) => !/^[._]|[._]$/.test(v), "Username cannot start or end with a period/underscore");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .regex(/[a-zA-Z]/, "Password must contain a letter")
  .regex(/[0-9]/, "Password must contain a number");

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(1, "Full name is required").max(60),
    username: usernameSchema,
    email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
    password: passwordSchema,
    avatarMediaId: z.string().uuid().optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    identifier: z.string().trim().min(1, "Username or email is required").max(254),
    password: z.string().min(1, "Password is required"),
  })
  .strict();

export const forgotPasswordSchema = z
  .object({ email: z.string().trim().toLowerCase().email().max(254) })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10).max(200),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .strict()
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(1).max(60).optional(),
    username: usernameSchema.optional(),
    bio: z.string().trim().max(200).optional(),
    website: z.string().trim().max(200).optional().or(z.literal("").transform(() => undefined)),
    avatarMediaId: z.string().uuid().nullable().optional(),
    isPrivate: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export const changeEmailSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
    password: z.string().min(1, "Password is required"),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .strict()
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const createPostSchema = z
  .object({
    caption: z.string().trim().max(2200).default(""),
    location: z.string().trim().max(100).optional(),
    mediaIds: z.array(z.string().uuid()).min(1, "Add at least one photo or video").max(10),
  })
  .strict();

export const createCommentSchema = z
  .object({
    body: z.string().trim().min(1, "Comment cannot be empty").max(1000),
    parentId: z.string().uuid().optional(),
  })
  .strict();

export const editCommentSchema = z
  .object({ body: z.string().trim().min(1, "Comment cannot be empty").max(1000) })
  .strict();

export const createStorySchema = z
  .object({
    kind: z.enum(["image", "video", "text"]),
    mediaId: z.string().uuid().optional(),
    bgColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    text: z.string().trim().max(280).optional(),
    caption: z.string().trim().max(120).optional(),
    overlayText: z.string().trim().max(120).optional(),
  })
  .strict()
  .refine((v) => (v.kind === "text" ? !!v.text && !!v.bgColor : !!v.mediaId), {
    message: "Text stories need text and a background color; media stories need a mediaId",
  });

export const sendMessageSchema = z
  .object({
    body: z.string().trim().max(2000).optional(),
    mediaId: z.string().uuid().optional(),
  })
  .strict()
  .refine((v) => (v.body?.length ?? 0) > 0 || !!v.mediaId, {
    message: "Message cannot be empty",
  });

export const startConversationSchema = z
  .object({ username: usernameSchema })
  .strict();

export const reportSchema = z
  .object({
    targetType: z.enum(["post", "user", "story", "comment", "message"]),
    targetId: z.string().uuid(),
    reason: z.string().trim().min(3, "Tell us what is wrong").max(500),
  })
  .strict();

export const blockSchema = z.object({ username: usernameSchema }).strict();
