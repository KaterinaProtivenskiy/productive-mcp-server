import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../services/productive.js";
import { paginationSchema, sortSchema } from "../schemas/common.js";
import type { JsonApiResource } from "../types.js";

function formatDeal(d: JsonApiResource): Record<string, unknown> {
  return {
    id: d.id,
    name: d.attributes.name,
    number: d.attributes.number,
    deal_type_id: d.attributes.deal_type_id,
    deal_status: d.attributes.deal_status,
    budget: d.attributes.budget,
    revenue: d.attributes.revenue,
    cost: d.attributes.cost,
    profit: d.attributes.profit,
    budget_total: d.attributes.budget_total,
    budget_used: d.attributes.budget_used,
    budgeted_time: d.attributes.budgeted_time,
    worked_time: d.attributes.worked_time,
    closed_at: d.attributes.closed_at,
    created_at: d.attributes.created_at,
    company_id: (d.relationships?.company?.data as { id: string } | null)?.id,
    project_id: (d.relationships?.project?.data as { id: string } | null)?.id,
    responsible_id: (
      d.relationships?.responsible?.data as { id: string } | null
    )?.id,
  };
}

export function registerDealTools(server: McpServer): void {
  server.registerTool("productive_list_deals", {
    title: "List Deals",
    description:
      "List budgets/deals from Productive.io. Filter by project, company, or deal status. " +
      "Deal status values: 1=open, 2=won, 3=lost. " +
      "Budgets are deals linked to projects for financial tracking.",
    inputSchema: z.object({
      ...paginationSchema,
      ...sortSchema,
      project_id: z
        .string()
        .optional()
        .describe("Filter by project ID"),
      company_id: z
        .string()
        .optional()
        .describe("Filter by company ID"),
      deal_status: z
        .number()
        .optional()
        .describe("Filter by deal status (1=open, 2=won, 3=lost)"),
      deal_type_id: z
        .number()
        .optional()
        .describe("Filter by deal type (1=internal, 2=client)"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const filters: Record<string, string | number | boolean> = {};
      if (args.project_id) filters.project_id = args.project_id;
      if (args.company_id) filters.company_id = args.company_id;
      if (args.deal_status) filters.stage_status_id = args.deal_status;
      if (args.deal_type_id) filters.deal_type_id = args.deal_type_id;

      const result = await client.list("deals", {
        page: args.page,
        pageSize: args.page_size,
        filters,
        sort: args.sort,
      });

      const deals = Array.isArray(result.data)
        ? result.data.map(formatDeal)
        : [];

      const response = {
        deals,
        total_count: result.meta?.total_count ?? deals.length,
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
            text: `Error listing deals: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  server.registerTool("productive_get_deal", {
    title: "Get Deal",
    description:
      "Get a single deal/budget by ID from Productive.io with full financial details.",
    inputSchema: z.object({
      id: z.string().describe("The deal/budget ID"),
      include: z
        .string()
        .optional()
        .describe("Comma-separated related resources to include (e.g. 'company,project,responsible')"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const result = await client.get("deals", args.id, args.include);
      const deal = !Array.isArray(result.data)
        ? formatDeal(result.data)
        : null;

      const response: Record<string, unknown> = { deal };
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
            text: `Error getting deal (ID: ${args.id}): ${error instanceof Error ? error.message : String(error)}. Use productive_list_deals to find valid IDs.`,
          },
        ],
        isError: true,
      };
    }
  });
}
