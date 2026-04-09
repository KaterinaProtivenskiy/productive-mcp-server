import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../services/productive.js";
import { paginationSchema } from "../schemas/common.js";
import type { JsonApiResource } from "../types.js";

function formatLineItem(li: JsonApiResource): Record<string, unknown> {
  const taxRateRel = li.relationships?.tax_rate?.data as { id: string } | null;
  return {
    id: li.id,
    description: li.attributes.description,
    quantity: li.attributes.quantity,
    unit_price: li.attributes.unit_price,
    unit_id: li.attributes.unit_id,
    amount: li.attributes.amount,
    amount_tax: li.attributes.amount_tax,
    amount_with_tax: li.attributes.amount_with_tax,
    discount: li.attributes.discount,
    position: li.attributes.position,
    service_type_id: li.attributes.service_type_id,
    tax_rate_id: taxRateRel?.id,
    currency: li.attributes.currency,
  };
}

export function registerLineItemTools(server: McpServer): void {
  // ── LIST LINE ITEMS ──
  server.registerTool("productive_list_line_items", {
    title: "List Line Items",
    description:
      "List line items for a specific invoice. Line items determine the invoice amount (quantity x unit_price).",
    inputSchema: z.object({
      ...paginationSchema,
      invoice_id: z.string().describe("The invoice ID to list line items for (required)"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const result = await client.list("line_items", {
        page: args.page,
        pageSize: args.page_size,
        filters: { invoice_id: args.invoice_id },
        include: "tax_rate",
      });

      const lineItems = Array.isArray(result.data) ? result.data.map(formatLineItem) : [];

      const response = {
        line_items: lineItems,
        total_count: result.meta?.total_count ?? lineItems.length,
        current_page: result.meta?.current_page ?? 1,
        total_pages: result.meta?.total_pages ?? 1,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error listing line items: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  });

  // ── CREATE LINE ITEM ──
  server.registerTool("productive_create_line_item", {
    title: "Create Line Item",
    description:
      "Create a line item on a draft invoice. Line items define the billable rows (description, quantity, unit_price). " +
      "Tax is set per line item via tax_rate_id.",
    inputSchema: z.object({
      invoice_id: z.string().describe("The invoice ID to add the line item to (required)"),
      description: z.string().describe("Description of the line item (required)"),
      quantity: z.number().describe("Quantity (required)"),
      unit_price: z.string().describe("Unit price as string e.g. '120.00' (required)"),
      unit_id: z.number().describe("Unit: 1=Hour, 2=Piece (required)"),
      service_type_id: z.number().optional().describe("Service type ID"),
      tax_rate_id: z.string().optional().describe("Tax rate ID for this line item"),
      position: z.number().optional().describe("Position/order of the line item"),
      discount: z.number().optional().describe("Discount percentage"),
    }),
  }, async (args) => {
    try {
      const client = getClient();

      const attributes: Record<string, unknown> = {
        description: args.description,
        quantity: args.quantity,
        unit_price: args.unit_price,
        unit_id: args.unit_id,
      };
      if (args.service_type_id) attributes.service_type_id = args.service_type_id;
      if (args.position != null) attributes.position = args.position;
      if (args.discount != null) attributes.discount = args.discount;

      const relationships: Record<string, { data: { type: string; id: string } | null }> = {
        invoice: { data: { type: "invoices", id: args.invoice_id } },
      };
      if (args.tax_rate_id) {
        relationships.tax_rate = { data: { type: "tax_rates", id: args.tax_rate_id } };
      }

      const result = await client.create("line_items", {
        type: "line_items",
        attributes,
        relationships,
      });

      const lineItem = !Array.isArray(result.data) ? formatLineItem(result.data) : null;

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ line_item: lineItem }, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error creating line item: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  });

  // ── UPDATE LINE ITEM ──
  server.registerTool("productive_update_line_item", {
    title: "Update Line Item",
    description: "Update an existing line item on a draft invoice (description, quantity, unit_price, discount).",
    inputSchema: z.object({
      id: z.string().describe("The line item ID to update"),
      description: z.string().optional().describe("Updated description"),
      quantity: z.number().optional().describe("Updated quantity"),
      unit_price: z.string().optional().describe("Updated unit price as string e.g. '150.00'"),
      unit_id: z.number().optional().describe("Updated unit: 1=Hour, 2=Piece"),
      discount: z.number().optional().describe("Updated discount percentage"),
      tax_rate_id: z.string().optional().describe("Updated tax rate ID"),
    }),
  }, async (args) => {
    try {
      const client = getClient();

      const attributes: Record<string, unknown> = {};
      if (args.description !== undefined) attributes.description = args.description;
      if (args.quantity !== undefined) attributes.quantity = args.quantity;
      if (args.unit_price !== undefined) attributes.unit_price = args.unit_price;
      if (args.unit_id !== undefined) attributes.unit_id = args.unit_id;
      if (args.discount !== undefined) attributes.discount = args.discount;

      const relationships: Record<string, { data: { type: string; id: string } | null }> | undefined =
        args.tax_rate_id !== undefined
          ? { tax_rate: { data: { type: "tax_rates", id: args.tax_rate_id } } }
          : undefined;

      const result = await client.update("line_items", args.id, {
        type: "line_items",
        id: args.id,
        attributes,
        relationships,
      });

      const lineItem = !Array.isArray(result.data) ? formatLineItem(result.data) : null;

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ line_item: lineItem }, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error updating line item: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  });

  // ── DELETE LINE ITEM ──
  server.registerTool("productive_delete_line_item", {
    title: "Delete Line Item",
    description: "Delete a line item from a draft invoice.",
    inputSchema: z.object({
      id: z.string().describe("The line item ID to delete"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      await client.delete("line_items", args.id);

      return {
        content: [{ type: "text" as const, text: `Line item ${args.id} deleted successfully.` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error deleting line item: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  });
}
