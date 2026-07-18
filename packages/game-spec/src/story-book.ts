import { z } from "zod";

export const storyBookInputSchema = z
  .object({
    title: z.string().trim().min(2).max(80),
    opening: z.string().trim().min(20).max(420),
    authors: z.array(z.string().trim().min(1).max(24)).min(2).max(12),
    entries: z
      .array(
        z
          .object({
            authorName: z.string().trim().min(1).max(24),
            text: z.string().trim().min(1).max(320),
          })
          .strict(),
      )
      .min(4)
      .max(16),
  })
  .strict();

export const storyBookChapterSchema = z
  .object({
    title: z.string().trim().min(2).max(70),
    text: z.string().trim().min(40).max(1_500),
  })
  .strict();

export const storyBookSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: z.string().trim().min(2).max(80),
    subtitle: z.string().trim().min(8).max(140),
    dedication: z.string().trim().min(8).max(180),
    backCover: z.string().trim().min(40).max(360),
    chapters: z.array(storyBookChapterSchema).min(2).max(4),
  })
  .strict();

export type StoryBookInput = z.infer<typeof storyBookInputSchema>;
export type StoryBook = z.infer<typeof storyBookSchema>;
