import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../services/productive.js";
import { paginationSchema, sortSchema } from "../schemas/common.js";
import { MAX_PAGE_SIZE } from "../constants.js";
import type { JsonApiResource } from "../types.js";

function formatPerson(p: JsonApiResource): Record<string, unknown> {
  return {
    id: p.id,
    first_name: p.attributes.first_name,
    last_name: p.attributes.last_name,
    email: p.attributes.email,
    title: p.attributes.title,
    role_id: p.attributes.role_id,
    status: p.attributes.status,
    is_user: p.attributes.is_user,
  };
}

export function registerPeopleTools(server: McpServer): void {
  server.registerTool("productive_list_people", {
    title: "List People",
    description:
      "List all team members in Productive.io. Returns ID, full name, email, and title. " +
      "Defaults to page_size=200 to get all members. Use this to find person IDs needed for task assignment or time logging.",
    inputSchema: z.object({
      ...paginationSchema,
      ...sortSchema,
      status: z
        .number()
        .optional()
        .describe("Filter by status (1=active, 2=deactivated)"),
      company_id: z
        .string()
        .optional()
        .describe("Filter by company ID"),
      query: z
        .string()
        .optional()
        .describe("Search people by name or email"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const filters: Record<string, string | number | boolean> = {};
      if (args.status) filters.status = args.status;
      if (args.company_id) filters.company_id = args.company_id;
      if (args.query) filters.query = args.query;

      const result = await client.list("people", {
        page: args.page,
        pageSize: args.page_size ?? MAX_PAGE_SIZE,
        filters,
        sort: args.sort,
      });

      const people = Array.isArray(result.data)
        ? result.data.map(formatPerson)
        : [];

      const response = {
        people,
        total_count: result.meta?.total_count ?? people.length,
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
            text: `Error listing people: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  server.registerTool("productive_get_person", {
    title: "Get Person",
    description:
      "Get details for a specific person by ID from Productive.io.",
    inputSchema: z.object({
      id: z.string().describe("The person ID"),
      include: z
        .string()
        .optional()
        .describe("Comma-separated related resources to include (e.g. 'company')"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const result = await client.get("people", args.id, args.include);
      const person = !Array.isArray(result.data)
        ? formatPerson(result.data)
        : null;

      const response: Record<string, unknown> = { person };
      if (result.included?.length) {
        response.included = result.included.map((r) => ({
          id: r.id,
          type: r.type,
          ...r.attributes,
        }));
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error getting person (ID: ${args.id}): ${error instanceof Error ? error.message : String(error)}. Use productive_list_people to find valid IDs.`,
          },
        ],
        isError: true,
      };
    }
  });
}
