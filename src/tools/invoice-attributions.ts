import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../services/productive.js";
import { paginationSchema } from "../schemas/common.js";
import type { JsonApiResource } from "../types.js";

function formatAttribution(attr: JsonApiResource): Record<string, unknown> {
  const budgetRel = attr.relationships?.budget?.data as { id: string } | null;
  const invoiceRel = attr.relationships?.invoice?.data as { id: string } | null;
  return {
    id: attr.id,
    amount: attr.attributes.amount,
    amount_default: attr.attributes.amount_default,
    currency: attr.attributes.currency,
    date_from: attr.attributes.date_from,
    date_to: attr.attributes.date_to,
    budget_id: budgetRel?.id,
    invoice_id: invoiceRel?.id,
  };
}

export function registerInvoiceAttributionTools(server: McpServer): void {
  // ── LIST INVOICE ATTRIBUTIONS ──
  server.registerTool("productive_list_invoice_attributions", {
    title: "List Invoice Attributions",
    description:
      "List invoice attributions (budget links) for a specific invoice. " +
      "Attributions connect invoices to budgets/deals for financial tracking.",
    inputSchema: z.object({
      ...paginationSchema,
      invoice_id: z.string().describe("The invoice ID to list attributions for (required)"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const result = await client.list("invoice_attributions", {
        page: args.page,
        pageSize: args.page_size,
        filters: { invoice_id: args.invoice_id },
      });

      const attributions = Array.isArray(result.data) ? result.data.map(formatAttribution) : [];

      const response = {
        invoice_attributions: attributions,
        total_count: result.meta?.total_count ?? attributions.length,
        current_page: result.meta?.current_page ?? 1,
        total_pages: result.meta?.total_pages ?? 1,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error listing invoice attributions: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  });

  // ── CREATE INVOICE ATTRIBUTION ──
  server.registerTool("productive_create_invoice_attribution", {
    title: "Create Invoice Attribution",
    description:
      "Link a draft invoice to a budget/deal with an allocated amount. " +
      "This connects the invoice to a budget for financial tracking in Productive.io.",
    inputSchema: z.object({
      invoice_id: z.string().describe("The invoice ID (required)"),
      deal_id: z.string().describe("The budget/deal ID to link to (required)"),
      amount: z.number().describe("The amount to allocate to this budget (required)"),
      date_from: z.string().optional().describe("Period start date (YYYY-MM-DD)"),
      date_to: z.string().optional().describe("Period end date (YYYY-MM-DD)"),
    }),
  }, async (args) => {
    try {
      const client = getClient();

      const attributes: Record<string, unknown> = {
        amount: args.amount,
      };
      if (args.date_from) attributes.date_from = args.date_from;
      if (args.date_to) attributes.date_to = args.date_to;

      const result = await client.create("invoice_attributions", {
        type: "invoice_attributions",
        attributes,
        relationships: {
          invoice: { data: { type: "invoices", id: args.invoice_id } },
          budget: { data: { type: "deals", id: args.deal_id } },
        },
      });

      const attribution = !Array.isArray(result.data) ? formatAttribution(result.data) : null;

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ invoice_attribution: attribution }, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error creating invoice attribution: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  });
}
