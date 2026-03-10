import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../services/productive.js";
import { paginationSchema, sortSchema } from "../schemas/common.js";
import type { JsonApiResource } from "../types.js";

function formatService(s: JsonApiResource): Record<string, unknown> {
  return {
    id: s.id,
    name: s.attributes.name,
    description: s.attributes.description,
    billing_type_id: s.attributes.billing_type_id,
    unit_id: s.attributes.unit_id,
    price: s.attributes.price,
    quantity: s.attributes.quantity,
    budget_total: s.attributes.budget_total,
    budget_used: s.attributes.budget_used,
    revenue: s.attributes.revenue,
    profit: s.attributes.profit,
    cost: s.attributes.cost,
    time_tracking_enabled: s.attributes.time_tracking_enabled,
    deal_id: (s.relationships?.deal?.data as { id: string } | null)?.id,
  };
}

export function registerServiceTools(server: McpServer): void {
  server.registerTool("productive_list_services", {
    title: "List Services",
    description:
      "List services (budget line items) in Productive.io. Filter by deal/budget ID. " +
      "Services belong to a deal/budget and define what work is tracked. " +
      "Billing types: 1=fixed, 2=time and materials, 3=not billable. " +
      "Use this to find service IDs needed for logging time.",
    inputSchema: z.object({
      ...paginationSchema,
      ...sortSchema,
      deal_id: z
        .string()
        .optional()
        .describe("Filter by deal/budget ID"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const filters: Record<string, string | number | boolean> = {};
      if (args.deal_id) filters.deal_id = args.deal_id;

      const result = await client.list("services", {
        page: args.page,
        pageSize: args.page_size,
        filters,
        sort: args.sort,
      });

      const services = Array.isArray(result.data)
        ? result.data.map(formatService)
        : [];

      const response = {
        services,
        total_count: result.meta?.total_count ?? services.length,
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
            text: `Error listing services: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });
}
