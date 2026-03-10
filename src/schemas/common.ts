import { z } from "zod";

export const paginationSchema = {
  page: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Page number (starts at 1)"),
  page_size: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Number of results per page (max 200)"),
};

export const sortSchema = {
  sort: z
    .string()
    .optional()
    .describe(
      "Sort field. Prefix with - for descending (e.g. '-created_at')"
    ),
};
