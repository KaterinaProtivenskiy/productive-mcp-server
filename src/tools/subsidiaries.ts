import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../services/productive.js";
import { paginationSchema } from "../schemas/common.js";
import type { JsonApiResource } from "../types.js";

function formatSubsidiary(s: JsonApiResource): Record<string, unknown> {
  return {
    id: s.id,
    name: s.attributes.name,
    archived_at: s.attributes.archived_at,
    invoice_number_format: s.attributes.invoice_number_format,
    show_delivery_date: s.attributes.show_delivery_date,
  };
}

export function registerSubsidiaryTools(server: McpServer): void {
  server.registerTool("productive_list_subsidiaries", {
    title: "List Subsidiaries",
    description:
      "List your company subsidiaries in Productive.io. Subsidiaries represent your company entities and determine the 'Bill From' on invoices. " +
      "Use this when creating invoices to find the correct subsidiary_id.",
    inputSchema: z.object({
      ...paginationSchema,
      status: z.number().optional().describe("Filter by status (1=active, 2=archived)"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const filters: Record<string, string | number | boolean> = {};
      if (args.status) filters.status = args.status;

      const result = await client.list("subsidiaries", {
        page: args.page,
        pageSize: args.page_size,
        filters,
      });

      const subsidiaries = Array.isArray(result.data) ? result.data.map(formatSubsidiary) : [];

      const response = {
        subsidiaries,
        total_count: result.meta?.total_count ?? subsidiaries.length,
        current_page: result.meta?.current_page ?? 1,
        total_pages: result.meta?.total_pages ?? 1,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error listing subsidiaries: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  });
}
