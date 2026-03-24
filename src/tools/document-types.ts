import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../services/productive.js";
import { paginationSchema } from "../schemas/common.js";
import type { JsonApiResource } from "../types.js";

function formatDocumentType(dt: JsonApiResource): Record<string, unknown> {
  const subsidiaryRel = dt.relationships?.subsidiary?.data as { id: string } | null;
  return {
    id: dt.id,
    name: dt.attributes.name,
    locale: dt.attributes.locale,
    exportable_type_id: dt.attributes.exportable_type_id,
    note: dt.attributes.note,
    footer: dt.attributes.footer,
    archived_at: dt.attributes.archived_at,
    subsidiary_id: subsidiaryRel?.id,
  };
}

export function registerDocumentTypeTools(server: McpServer): void {
  server.registerTool("productive_list_document_types", {
    title: "List Document Types",
    description:
      "List available document types in Productive.io. Document types determine the invoice template, locale, and tax defaults. " +
      "Use this when creating invoices to find the correct document_type_id.",
    inputSchema: z.object({
      ...paginationSchema,
      subsidiary_id: z.string().optional().describe("Filter by subsidiary ID"),
      status: z.number().optional().describe("Filter by status (1=active, 2=archived)"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const filters: Record<string, string | number | boolean> = {};
      if (args.subsidiary_id) filters.subsidiary_id = args.subsidiary_id;
      if (args.status) filters.status = args.status;
      // Only show invoice document types by default
      filters.exportable_type_id = 1;

      const result = await client.list("document_types", {
        page: args.page,
        pageSize: args.page_size,
        filters,
      });

      const docTypes = Array.isArray(result.data) ? result.data.map(formatDocumentType) : [];

      const response = {
        document_types: docTypes,
        total_count: result.meta?.total_count ?? docTypes.length,
        current_page: result.meta?.current_page ?? 1,
        total_pages: result.meta?.total_pages ?? 1,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error listing document types: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  });
}
