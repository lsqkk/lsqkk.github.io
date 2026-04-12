import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const posts = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./posts" }),
  schema: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    date: z.union([z.string(), z.date()]).optional(),
    tags: z.union([z.array(z.string()), z.string()]).optional(),
    column: z.union([z.array(z.string()), z.string()]).optional(),
    columns: z.union([z.array(z.string()), z.string()]).optional(),
  }),
});

export const collections = { posts };
