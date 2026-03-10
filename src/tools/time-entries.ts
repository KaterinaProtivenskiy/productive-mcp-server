import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../services/productive.js";
import { paginationSchema, sortSchema } from "../schemas/common.js";
import { TIMEZONE_OFFSET } from "../constants.js";
import type { JsonApiResource } from "../types.js";

function formatTimeEntry(t: JsonApiResource): Record<string, unknown> {
  return {
    id: t.id,
    date: t.attributes.date,
    time: t.attributes.time,
    started_at: t.attributes.started_at,
    ended_at: t.attributes.ended_at,
    note: t.attributes.note,
    approved: t.attributes.approved,
    billable_time: t.attributes.billable_time,
    created_at: t.attributes.created_at,
    person_id: (t.relationships?.person?.data as { id: string } | null)?.id,
    service_id: (t.relationships?.service?.data as { id: string } | null)?.id,
    task_id: (t.relationships?.task?.data as { id: string } | null)?.id,
  };
}

export function registerTimeEntryTools(server: McpServer): void {
  server.registerTool("productive_list_time_entries", {
    title: "List Time Entries",
    description:
      "List time entries from Productive.io. Filter by person, service, project, or date range. " +
      "Returns individual entries plus a summary with total hours. " +
      "Date filters use 'after' and 'before' in YYYY-MM-DD format.",
    inputSchema: z.object({
      ...paginationSchema,
      ...sortSchema,
      person_id: z
        .string()
        .optional()
        .describe("Filter by person ID"),
      service_id: z
        .string()
        .optional()
        .describe("Filter by service ID"),
      project_id: z
        .string()
        .optional()
        .describe("Filter by project ID"),
      after: z
        .string()
        .optional()
        .describe("Only entries after this date (YYYY-MM-DD)"),
      before: z
        .string()
        .optional()
        .describe("Only entries before this date (YYYY-MM-DD)"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const filters: Record<string, string | number | boolean> = {};
      if (args.person_id) filters.person_id = args.person_id;
      if (args.service_id) filters.service_id = args.service_id;
      if (args.project_id) filters.project_id = args.project_id;
      if (args.after) filters.after = args.after;
      if (args.before) filters.before = args.before;

      const result = await client.list("time_entries", {
        page: args.page,
        pageSize: args.page_size,
        filters,
        sort: args.sort,
      });

      const entries = Array.isArray(result.data)
        ? result.data.map(formatTimeEntry)
        : [];

      const totalMinutes = entries.reduce(
        (sum, e) => sum + (typeof e.time === "number" ? e.time : 0),
        0
      );

      const response = {
        time_entries: entries,
        summary: {
          total_entries: result.meta?.total_count ?? entries.length,
          total_minutes: totalMinutes,
          total_hours: Math.round((totalMinutes / 60) * 100) / 100,
        },
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
            text: `Error listing time entries: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  server.registerTool("productive_log_time", {
    title: "Log Time",
    description:
      "Create a new time entry in Productive.io. Requires person_id, service_id, and date. " +
      "You can specify duration either as 'time' in minutes OR as 'started_at'/'ended_at' times (HH:MM format). " +
      "When started_at and ended_at are provided, the duration is auto-calculated and the entry shows as a time block. " +
      "ALWAYS prefer started_at/ended_at when the user mentions start/end times (e.g. '9 to 5', '09:00-17:00'). " +
      "Use productive_list_people to find person IDs. Use productive_list_services to find service IDs.",
    inputSchema: z.object({
      person_id: z
        .string()
        .describe("Person ID who performed the work"),
      service_id: z
        .string()
        .describe("Service/budget line item ID to log time against"),
      date: z
        .string()
        .describe("Date of the work in YYYY-MM-DD format"),
      time: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Time spent in minutes (e.g. 90 for 1.5 hours). Optional if started_at and ended_at are provided."),
      started_at: z
        .string()
        .optional()
        .describe("Start time in HH:MM format (e.g. '09:00'). Used with ended_at to create a time block."),
      ended_at: z
        .string()
        .optional()
        .describe("End time in HH:MM format (e.g. '17:00'). Used with started_at to create a time block."),
      note: z
        .string()
        .optional()
        .describe("Description of work performed"),
      task_id: z
        .string()
        .optional()
        .describe("Optional task ID to associate with this time entry"),
    }),
  }, async (args) => {
    try {
      const client = getClient();

      let timeMinutes = args.time;

      // If started_at and ended_at are provided, calculate duration
      if (args.started_at && args.ended_at) {
        const [startH, startM] = args.started_at.split(":").map(Number);
        const [endH, endM] = args.ended_at.split(":").map(Number);
        const startTotal = startH * 60 + startM;
        const endTotal = endH * 60 + endM;
        const calculated = endTotal - startTotal;
        if (calculated <= 0) {
          return {
            content: [{ type: "text" as const, text: "Error: ended_at must be after started_at." }],
            isError: true,
          };
        }
        timeMinutes = calculated;
      }

      if (!timeMinutes) {
        return {
          content: [{ type: "text" as const, text: "Error: Provide either 'time' in minutes or both 'started_at' and 'ended_at'." }],
          isError: true,
        };
      }

      const body: {
        type: string;
        attributes: Record<string, unknown>;
        relationships: Record<string, { data: { type: string; id: string } }>;
      } = {
        type: "time_entries",
        attributes: {
          date: args.date,
          time: timeMinutes,
        },
        relationships: {
          person: { data: { type: "people", id: args.person_id } },
          service: { data: { type: "services", id: args.service_id } },
        },
      };

      // Add started_at/ended_at as ISO timestamps so Productive shows a time block
      if (args.started_at && args.ended_at) {
        const tz = TIMEZONE_OFFSET === "Z" ? "Z" : TIMEZONE_OFFSET;
        body.attributes.started_at = `${args.date}T${args.started_at}:00.000${tz}`;
        body.attributes.ended_at = `${args.date}T${args.ended_at}:00.000${tz}`;
      }

      if (args.note) body.attributes.note = args.note;
      if (args.task_id) {
        body.relationships.task = {
          data: { type: "tasks", id: args.task_id },
        };
      }

      const result = await client.create("time_entries", body);
      const entry = !Array.isArray(result.data)
        ? formatTimeEntry(result.data)
        : null;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { time_entry: entry, message: "Time entry created successfully" },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error logging time: ${error instanceof Error ? error.message : String(error)}. ` +
              "Ensure person_id and service_id are valid. Use productive_list_people and productive_list_services to find IDs.",
          },
        ],
        isError: true,
      };
    }
  });
}
