import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../services/productive.js";
import { paginationSchema, sortSchema } from "../schemas/common.js";
import type { JsonApiResource } from "../types.js";

function formatBooking(b: JsonApiResource): Record<string, unknown> {
  return {
    id: b.id,
    started_on: b.attributes.started_on,
    ended_on: b.attributes.ended_on,
    time: b.attributes.time,
    total_time: b.attributes.total_time,
    percentage: b.attributes.percentage,
    booking_method_id: b.attributes.booking_method_id,
    approved: b.attributes.approved,
    rejected: b.attributes.rejected,
    canceled: b.attributes.canceled,
    created_at: b.attributes.created_at,
    person_id: (b.relationships?.person?.data as { id: string } | null)?.id,
    project_id: (b.relationships?.project?.data as { id: string } | null)?.id,
    service_id: (b.relationships?.service?.data as { id: string } | null)?.id,
    event_id: (b.relationships?.event?.data as { id: string } | null)?.id,
  };
}

export function registerBookingTools(server: McpServer): void {
  server.registerTool("productive_list_bookings", {
    title: "List Bookings",
    description:
      "List resource bookings/scheduling from Productive.io. " +
      "Filter by person, project, or date range to see who is booked and when. " +
      "Booking methods: 1=per day, 2=percentage, 3=total hours.",
    inputSchema: z.object({
      ...paginationSchema,
      ...sortSchema,
      person_id: z
        .string()
        .optional()
        .describe("Filter by person ID"),
      project_id: z
        .string()
        .optional()
        .describe("Filter by project ID"),
      after: z
        .string()
        .optional()
        .describe("Only bookings starting after this date (YYYY-MM-DD)"),
      before: z
        .string()
        .optional()
        .describe("Only bookings starting before this date (YYYY-MM-DD)"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const filters: Record<string, string | number | boolean> = {};
      if (args.person_id) filters.person_id = args.person_id;
      if (args.project_id) filters.project_id = args.project_id;
      if (args.after) filters.after = args.after;
      if (args.before) filters.before = args.before;

      const result = await client.list("bookings", {
        page: args.page,
        pageSize: args.page_size,
        filters,
        sort: args.sort,
      });

      const bookings = Array.isArray(result.data)
        ? result.data.map(formatBooking)
        : [];

      const response = {
        bookings,
        total_count: result.meta?.total_count ?? bookings.length,
        current_page: result.meta?.current_page ?? 1,
        total_pages: result.meta?.total_pages ?? 1,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing bookings: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });
}
