import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../services/productive.js";
import { paginationSchema, sortSchema } from "../schemas/common.js";
import type { JsonApiResource } from "../types.js";

function formatCompany(c: JsonApiResource): Record<string, unknown> {
  return {
    id: c.id,
    name: c.attributes.name,
    billing_name: c.attributes.billing_name,
    vat: c.attributes.vat,
    default_currency: c.attributes.default_currency,
    company_code: c.attributes.company_code,
    domain: c.attributes.domain,
    tag_list: c.attributes.tag_list,
    contact: c.attributes.contact,
    archived_at: c.attributes.archived_at,
    created_at: c.attributes.created_at,
  };
}

export function registerCompanyTools(server: McpServer): void {
  server.registerTool("productive_list_companies", {
    title: "List Companies",
    description:
      "List companies (clients) in Productive.io. Filter by status or search by name. " +
      "Use this to find company IDs needed for creating projects or filtering deals.",
    inputSchema: z.object({
      ...paginationSchema,
      ...sortSchema,
      status: z
        .number()
        .optional()
        .describe("Filter by status (1=active, 2=archived)"),
      query: z
        .string()
        .optional()
        .describe("Search companies by name"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const filters: Record<string, string | number | boolean> = {};
      if (args.status) filters.status = args.status;
      if (args.query) filters.name = args.query;

      const result = await client.list("companies", {
        page: args.page,
        pageSize: args.page_size,
        filters,
        sort: args.sort,
      });

      const companies = Array.isArray(result.data)
        ? result.data.map(formatCompany)
        : [];

      const response = {
        companies,
        total_count: result.meta?.total_count ?? companies.length,
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
            text: `Error listing companies: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  server.registerTool("productive_get_company", {
    title: "Get Company",
    description:
      "Get a single company by ID from Productive.io with full details.",
    inputSchema: z.object({
      id: z.string().describe("The company ID"),
      include: z
        .string()
        .optional()
        .describe("Comma-separated related resources to include"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const result = await client.get("companies", args.id, args.include);
      const company = !Array.isArray(result.data)
        ? formatCompany(result.data)
        : null;

      const response: Record<string, unknown> = { company };
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
            text: `Error getting company (ID: ${args.id}): ${error instanceof Error ? error.message : String(error)}. Use productive_list_companies to find valid IDs.`,
          },
        ],
        isError: true,
      };
    }
  });
}
