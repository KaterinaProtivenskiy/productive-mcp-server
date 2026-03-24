import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../services/productive.js";
import { paginationSchema } from "../schemas/common.js";
import type { JsonApiResource } from "../types.js";

function formatTaxRate(tr: JsonApiResource): Record<string, unknown> {
  return {
    id: tr.id,
    name: tr.attributes.name,
    percentage: tr.attributes.percentage,
    tax_type: tr.attributes.tax_type,
    archived_at: tr.attributes.archived_at,
  };
}

export function registerTaxRateTools(server: McpServer): void {
  server.registerTool("productive_list_tax_rates", {
    title: "List Tax Rates",
    description:
      "List available tax rates in Productive.io. Tax rates are applied per line item (not per invoice). " +
      "Use this to find the correct tax_rate_id when creating line items.",
    inputSchema: z.object({
      ...paginationSchema,
      status: z.number().optional().describe("Filter by status (1=active, 2=archived)"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const filters: Record<string, string | number | boolean> = {};
      if (args.status) filters.status = args.status;

      const result = await client.list("tax_rates", {
        page: args.page,
        pageSize: args.page_size,
        filters,
      });

      const taxRates = Array.isArray(result.data) ? result.data.map(formatTaxRate) : [];

      const response = {
        tax_rates: taxRates,
        total_count: result.meta?.total_count ?? taxRates.length,
        current_page: result.meta?.current_page ?? 1,
        total_pages: result.meta?.total_pages ?? 1,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error listing tax rates: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  });
}
