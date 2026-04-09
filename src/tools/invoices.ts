import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../services/productive.js";
import { paginationSchema, sortSchema } from "../schemas/common.js";
import type { JsonApiResource } from "../types.js";

function formatInvoice(inv: JsonApiResource): Record<string, unknown> {
  const companyRel = inv.relationships?.company?.data as { id: string } | null;
  const docTypeRel = inv.relationships?.document_type?.data as { id: string } | null;
  const subsidiaryRel = inv.relationships?.subsidiary?.data as { id: string } | null;
  return {
    id: inv.id,
    number: inv.attributes.number,
    subject: inv.attributes.subject,
    invoiced_on: inv.attributes.invoiced_on,
    pay_on: inv.attributes.pay_on,
    paid_on: inv.attributes.paid_on,
    sent_on: inv.attributes.sent_on,
    finalized_on: inv.attributes.finalized_on,
    delivery_on: inv.attributes.delivery_on,
    currency: inv.attributes.currency,
    amount: inv.attributes.amount,
    amount_tax: inv.attributes.amount_tax,
    amount_with_tax: inv.attributes.amount_with_tax,
    amount_paid: inv.attributes.amount_paid,
    amount_unpaid: inv.attributes.amount_unpaid,
    invoice_type_id: inv.attributes.invoice_type_id,
    note: inv.attributes.note,
    footer: inv.attributes.footer,
    purchase_order_number: inv.attributes.purchase_order_number,
    pay_on_relative: inv.attributes.pay_on_relative,
    company_id: companyRel?.id,
    document_type_id: docTypeRel?.id,
    subsidiary_id: subsidiaryRel?.id,
  };
}

function formatIncluded(included: JsonApiResource[] | undefined): Record<string, unknown>[] | undefined {
  if (!included?.length) return undefined;
  return included.map((r) => ({
    id: r.id,
    type: r.type,
    ...r.attributes,
  }));
}

function draftReminder(): string {
  return "\n\n→ Invoice saved as draft. To finalize and assign a number, open it in the Productive.io UI.";
}

export function registerInvoiceTools(server: McpServer): void {
  // ── LIST INVOICES ──
  server.registerTool("productive_list_invoices", {
    title: "List Invoices",
    description:
      "List invoices from Productive.io with optional filters. " +
      "Use this to find invoices for a client, filter by status, or find source invoices to clone.",
    inputSchema: z.object({
      ...paginationSchema,
      ...sortSchema,
      company_id: z.string().optional().describe("Filter by company/client ID"),
      deal_id: z.string().optional().describe("Filter by budget/deal ID"),
      invoice_type_id: z.number().optional().describe("Filter by type (1=invoice, 2=credit_note)"),
      invoice_status: z.string().optional().describe("Filter by status (e.g. draft, finalized, sent, paid)"),
      invoiced_on_after: z.string().optional().describe("Filter invoices on or after this date (YYYY-MM-DD)"),
      invoiced_on_before: z.string().optional().describe("Filter invoices on or before this date (YYYY-MM-DD)"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const filters: Record<string, string | number | boolean> = {};
      if (args.company_id) filters.company_id = args.company_id;
      if (args.deal_id) filters.deal_id = args.deal_id;
      if (args.invoice_type_id) filters.invoice_type_id = args.invoice_type_id;
      if (args.invoice_status) filters.invoice_status = args.invoice_status;
      if (args.invoiced_on_after) filters["invoiced_on_after"] = args.invoiced_on_after;
      if (args.invoiced_on_before) filters["invoiced_on_before"] = args.invoiced_on_before;

      const result = await client.list("invoices", {
        page: args.page,
        pageSize: args.page_size,
        filters,
        sort: args.sort ?? "-invoiced_on",
        include: "company",
      });

      const invoices = Array.isArray(result.data) ? result.data.map(formatInvoice) : [];

      // Enrich with company names from included data
      const companyMap = new Map<string, string>();
      if (result.included) {
        for (const inc of result.included) {
          if (inc.type === "companies") {
            companyMap.set(inc.id, inc.attributes.name as string);
          }
        }
      }
      for (const inv of invoices) {
        if (inv.company_id && companyMap.has(inv.company_id as string)) {
          (inv as Record<string, unknown>).company_name = companyMap.get(inv.company_id as string);
        }
      }

      const response = {
        invoices,
        total_count: result.meta?.total_count ?? invoices.length,
        current_page: result.meta?.current_page ?? 1,
        total_pages: result.meta?.total_pages ?? 1,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error listing invoices: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  });

  // ── GET INVOICE ──
  server.registerTool("productive_get_invoice", {
    title: "Get Invoice",
    description:
      "Get full invoice details by ID, including line items, attributions, company, document type, and subsidiary. " +
      "Use this to inspect an invoice before cloning it.",
    inputSchema: z.object({
      id: z.string().describe("The invoice ID"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const result = await client.get(
        "invoices",
        args.id,
        "company,line_items,invoice_attributions,document_type,subsidiary"
      );

      const invoice = !Array.isArray(result.data) ? formatInvoice(result.data) : null;
      const response: Record<string, unknown> = { invoice, included: formatIncluded(result.included) };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error getting invoice (ID: ${args.id}): ${error instanceof Error ? error.message : String(error)}. Use productive_list_invoices to find valid IDs.`,
        }],
        isError: true,
      };
    }
  });

  // ── CREATE INVOICE (DRAFT ONLY) ──
  server.registerTool("productive_create_invoice", {
    title: "Create Draft Invoice",
    description:
      "Creates a new draft invoice. The invoice will NOT be finalized or assigned a number — " +
      "finalization must be done manually in the Productive.io UI.",
    inputSchema: z.object({
      company_id: z.string().describe("The client/company ID (required)"),
      document_type_id: z.string().describe("The document type ID (required)"),
      subsidiary_id: z.string().optional().describe("The subsidiary ID (your company entity)"),
      invoiced_on: z.string().optional().describe("Invoice date (YYYY-MM-DD, defaults to today)"),
      pay_on: z.string().optional().describe("Due date (YYYY-MM-DD)"),
      currency: z.string().optional().describe("Currency code (e.g. EUR, USD)"),
      subject: z.string().optional().describe("Invoice subject line"),
      note: z.string().optional().describe("Internal note on the invoice"),
      footer: z.string().optional().describe("Footer text"),
      purchase_order_number: z.string().optional().describe("PO number"),
      delivery_on: z.string().optional().describe("Delivery date (YYYY-MM-DD)"),
      invoice_type_id: z.number().optional().describe("Invoice type (1=invoice, 2=credit_note; defaults to 1)"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const today = new Date().toISOString().split("T")[0];

      const attributes: Record<string, unknown> = {
        invoiced_on: args.invoiced_on ?? today,
        invoice_type_id: args.invoice_type_id ?? 1,
      };
      if (args.pay_on) attributes.pay_on = args.pay_on;
      if (args.currency) attributes.currency = args.currency;
      if (args.subject) attributes.subject = args.subject;
      if (args.note) attributes.note = args.note;
      if (args.footer) attributes.footer = args.footer;
      if (args.purchase_order_number) attributes.purchase_order_number = args.purchase_order_number;
      if (args.delivery_on) attributes.delivery_on = args.delivery_on;

      const relationships: Record<string, { data: { type: string; id: string } | null }> = {
        company: { data: { type: "companies", id: args.company_id } },
        document_type: { data: { type: "document_types", id: args.document_type_id } },
      };
      if (args.subsidiary_id) {
        relationships.subsidiary = { data: { type: "subsidiaries", id: args.subsidiary_id } };
      }

      const result = await client.create("invoices", {
        type: "invoices",
        attributes,
        relationships,
      });

      const invoice = !Array.isArray(result.data) ? formatInvoice(result.data) : null;

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ invoice }, null, 2) + draftReminder() }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error creating invoice: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  });

  // ── UPDATE INVOICE (DRAFT ONLY) ──
  server.registerTool("productive_update_invoice", {
    title: "Update Draft Invoice",
    description:
      "Update an existing draft invoice. Cannot be used to finalize an invoice. " +
      "Only draft invoices (not yet finalized) can be updated.",
    inputSchema: z.object({
      id: z.string().describe("The invoice ID to update"),
      subject: z.string().optional().describe("Invoice subject line"),
      note: z.string().optional().describe("Internal note"),
      footer: z.string().optional().describe("Footer text"),
      invoiced_on: z.string().optional().describe("Invoice date (YYYY-MM-DD)"),
      pay_on: z.string().optional().describe("Due date (YYYY-MM-DD)"),
      delivery_on: z.string().optional().describe("Delivery date (YYYY-MM-DD)"),
      purchase_order_number: z.string().optional().describe("PO number"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const attributes: Record<string, unknown> = {};
      if (args.subject !== undefined) attributes.subject = args.subject;
      if (args.note !== undefined) attributes.note = args.note;
      if (args.footer !== undefined) attributes.footer = args.footer;
      if (args.invoiced_on !== undefined) attributes.invoiced_on = args.invoiced_on;
      if (args.pay_on !== undefined) attributes.pay_on = args.pay_on;
      if (args.delivery_on !== undefined) attributes.delivery_on = args.delivery_on;
      if (args.purchase_order_number !== undefined) attributes.purchase_order_number = args.purchase_order_number;

      const result = await client.update("invoices", args.id, {
        type: "invoices",
        id: args.id,
        attributes,
      });

      const invoice = !Array.isArray(result.data) ? formatInvoice(result.data) : null;

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ invoice }, null, 2) + draftReminder() }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error updating invoice: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  });

  // ── CREATE INVOICE FROM PREVIOUS (CLONE) ──
  server.registerTool("productive_create_invoice_from_previous", {
    title: "Clone Invoice from Previous",
    description:
      "Creates a new draft invoice based on a previous invoice, copying line items and budget links. " +
      "The new invoice is saved as a draft — it will not be finalized or assigned a number. " +
      "Use productive_get_invoice first to inspect the source invoice.",
    inputSchema: z.object({
      source_invoice_id: z.string().describe("The ID of the invoice to clone from"),
      invoiced_on: z.string().optional().describe("Override invoice date (YYYY-MM-DD, defaults to today)"),
      pay_on: z.string().optional().describe("Override due date (YYYY-MM-DD)"),
      subject: z.string().optional().describe("Override subject line"),
      note: z.string().optional().describe("Override note"),
    }),
  }, async (args) => {
    try {
      return await cloneInvoice(args.source_invoice_id, {
        invoiced_on: args.invoiced_on,
        pay_on: args.pay_on,
        subject: args.subject,
        note: args.note,
      });
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error cloning invoice: ${error instanceof Error ? error.message : String(error)}. Use productive_list_invoices to find valid source invoice IDs.`,
        }],
        isError: true,
      };
    }
  });

  // ── CREATE INVOICE LIKE LAST FOR CLIENT ──
  server.registerTool("productive_create_invoice_like_last_for_client", {
    title: "Clone Last Invoice for Client",
    description:
      "Creates a new draft invoice for a client based on their most recent invoice (or Nth most recent). " +
      "Copies line items and budget links. The new invoice is saved as a draft — " +
      "it will not be finalized or assigned a number.",
    inputSchema: z.object({
      company_id: z.string().describe("The client/company ID"),
      how_many_back: z.number().int().min(1).optional().describe("Which previous invoice to clone: 1=most recent (default), 2=second-to-last, etc."),
      invoiced_on: z.string().optional().describe("Override invoice date (YYYY-MM-DD, defaults to today)"),
      pay_on: z.string().optional().describe("Override due date (YYYY-MM-DD)"),
      subject: z.string().optional().describe("Override subject line"),
      note: z.string().optional().describe("Override note"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const offset = (args.how_many_back ?? 1) - 1;
      const pageSize = offset + 1;

      const result = await client.list("invoices", {
        page: 1,
        pageSize: Math.min(pageSize, 200),
        filters: { company_id: args.company_id },
        sort: "-invoiced_on",
      });

      const invoices = Array.isArray(result.data) ? result.data : [];
      if (invoices.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No invoices found for company ID ${args.company_id}. Use productive_list_companies to verify the company ID.` }],
          isError: true,
        };
      }

      if (offset >= invoices.length) {
        return {
          content: [{
            type: "text" as const,
            text: `Company only has ${invoices.length} invoice(s), but you requested the #${args.how_many_back} most recent. Try a smaller value for how_many_back.`,
          }],
          isError: true,
        };
      }

      const sourceInvoice = invoices[offset];
      console.error(`Found source invoice ID ${sourceInvoice.id} (${sourceInvoice.attributes.subject || "no subject"}, dated ${sourceInvoice.attributes.invoiced_on})`);

      return await cloneInvoice(sourceInvoice.id, {
        invoiced_on: args.invoiced_on,
        pay_on: args.pay_on,
        subject: args.subject,
        note: args.note,
      });
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error creating invoice like last for client: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  });
}

// ── Shared clone logic ──

interface CloneOverrides {
  invoiced_on?: string;
  pay_on?: string;
  subject?: string;
  note?: string;
}

async function cloneInvoice(sourceId: string, overrides: CloneOverrides) {
  const client = getClient();

  // Step 1: Fetch source invoice with includes
  console.error(`[clone] Fetching source invoice ${sourceId}...`);
  const sourceResult = await client.get(
    "invoices",
    sourceId,
    "company,document_type,subsidiary"
  );
  const src = sourceResult.data;

  // Step 2: Fetch line items and attributions separately for completeness
  console.error(`[clone] Fetching line items for invoice ${sourceId}...`);
  const lineItemsResult = await client.list("line_items", {
    filters: { invoice_id: sourceId },
    pageSize: 200,
    include: "tax_rate",
  });
  const sourceLineItems = Array.isArray(lineItemsResult.data) ? lineItemsResult.data : [];
  console.error(`[clone] Found ${sourceLineItems.length} line item(s)`);

  console.error(`[clone] Fetching invoice attributions for invoice ${sourceId}...`);
  const attributionsResult = await client.list("invoice_attributions", {
    filters: { invoice_id: sourceId },
    pageSize: 200,
  });
  const sourceAttributions = Array.isArray(attributionsResult.data) ? attributionsResult.data : [];
  console.error(`[clone] Found ${sourceAttributions.length} attribution(s)`);

  // Step 3: Create new draft invoice
  const today = new Date().toISOString().split("T")[0];
  const invoicedOn = overrides.invoiced_on ?? today;

  // Calculate pay_on from source's relative payment terms or override
  let payOn = overrides.pay_on;
  if (!payOn && src.attributes.pay_on_relative) {
    const dueDate = new Date(invoicedOn);
    dueDate.setDate(dueDate.getDate() + Number(src.attributes.pay_on_relative));
    payOn = dueDate.toISOString().split("T")[0];
  } else if (!payOn && src.attributes.pay_on && src.attributes.invoiced_on) {
    // Calculate the same day-gap as the source
    const srcInvoiced = new Date(src.attributes.invoiced_on as string);
    const srcPay = new Date(src.attributes.pay_on as string);
    const dayGap = Math.round((srcPay.getTime() - srcInvoiced.getTime()) / (1000 * 60 * 60 * 24));
    const dueDate = new Date(invoicedOn);
    dueDate.setDate(dueDate.getDate() + dayGap);
    payOn = dueDate.toISOString().split("T")[0];
  }

  const companyId = (src.relationships?.company?.data as { id: string } | null)?.id;
  const docTypeId = (src.relationships?.document_type?.data as { id: string } | null)?.id;
  const subsidiaryId = (src.relationships?.subsidiary?.data as { id: string } | null)?.id;

  if (!companyId || !docTypeId) {
    throw new Error("Source invoice is missing required company or document_type relationship");
  }

  const attributes: Record<string, unknown> = {
    invoiced_on: invoicedOn,
    subject: overrides.subject ?? src.attributes.subject,
    note: overrides.note ?? src.attributes.note,
    footer: src.attributes.footer,
    purchase_order_number: src.attributes.purchase_order_number,
    invoice_type_id: src.attributes.invoice_type_id,
    // NEVER copy: finalized_on, finalized_at, number, sent_on
  };
  if (payOn) attributes.pay_on = payOn;
  if (src.attributes.currency) attributes.currency = src.attributes.currency;

  const relationships: Record<string, { data: { type: string; id: string } | null }> = {
    company: { data: { type: "companies", id: companyId } },
    document_type: { data: { type: "document_types", id: docTypeId } },
  };
  if (subsidiaryId) {
    relationships.subsidiary = { data: { type: "subsidiaries", id: subsidiaryId } };
  }

  console.error(`[clone] Creating new draft invoice for company ${companyId}...`);
  const newInvoiceResult = await client.create("invoices", {
    type: "invoices",
    attributes,
    relationships,
  });
  const newInvoiceId = newInvoiceResult.data.id;
  console.error(`[clone] Created draft invoice ID ${newInvoiceId}`);

  // Step 4: Copy line items
  const createdLineItems: JsonApiResource[] = [];
  const failedLineItems: string[] = [];

  for (const item of sourceLineItems) {
    try {
      const itemAttrs: Record<string, unknown> = {
        description: item.attributes.description,
        quantity: item.attributes.quantity,
        unit_price: item.attributes.unit_price,
        unit_id: item.attributes.unit_id,
        position: item.attributes.position,
      };
      if (item.attributes.service_type_id) itemAttrs.service_type_id = item.attributes.service_type_id;
      if (item.attributes.discount != null) itemAttrs.discount = item.attributes.discount;

      const itemRels: Record<string, { data: { type: string; id: string } | null }> = {
        invoice: { data: { type: "invoices", id: newInvoiceId } },
      };

      const taxRateData = item.relationships?.tax_rate?.data as { id: string; type: string } | null;
      if (taxRateData) {
        itemRels.tax_rate = { data: { type: "tax_rates", id: taxRateData.id } };
      }

      const newItem = await client.create("line_items", {
        type: "line_items",
        attributes: itemAttrs,
        relationships: itemRels,
      });
      createdLineItems.push(newItem.data);
      console.error(`[clone] Created line item ${newItem.data.id}: ${item.attributes.description}`);
    } catch (err) {
      const msg = `Failed to clone line item "${item.attributes.description}": ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[clone] ${msg}`);
      failedLineItems.push(msg);
    }
  }

  // Step 5: Copy invoice attributions
  const createdAttributions: JsonApiResource[] = [];
  const failedAttributions: string[] = [];

  for (const attr of sourceAttributions) {
    try {
      const budgetData = attr.relationships?.budget?.data as { id: string; type: string } | null;
      if (!budgetData) {
        console.error(`[clone] Skipping attribution ${attr.id} — no budget relationship`);
        continue;
      }

      const attrAttrs: Record<string, unknown> = {
        amount: attr.attributes.amount,
      };
      if (attr.attributes.date_from) attrAttrs.date_from = attr.attributes.date_from;
      if (attr.attributes.date_to) attrAttrs.date_to = attr.attributes.date_to;

      const newAttr = await client.create("invoice_attributions", {
        type: "invoice_attributions",
        attributes: attrAttrs,
        relationships: {
          invoice: { data: { type: "invoices", id: newInvoiceId } },
          budget: { data: { type: "deals", id: budgetData.id } },
        },
      });
      createdAttributions.push(newAttr.data);
      console.error(`[clone] Created attribution ${newAttr.data.id} for budget ${budgetData.id}`);
    } catch (err) {
      const budgetData = attr.relationships?.budget?.data as { id: string } | null;
      const msg = `Failed to clone attribution for budget ${budgetData?.id ?? "unknown"}: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[clone] ${msg}`);
      failedAttributions.push(msg);
    }
  }

  // Step 6: Build response
  const newInvoice = formatInvoice(newInvoiceResult.data);
  const summary: Record<string, unknown> = {
    invoice: newInvoice,
    cloned_from: sourceId,
    line_items_created: createdLineItems.length,
    attributions_created: createdAttributions.length,
  };

  if (failedLineItems.length > 0) summary.failed_line_items = failedLineItems;
  if (failedAttributions.length > 0) summary.failed_attributions = failedAttributions;
  if (sourceLineItems.length === 0) summary.warning = "Source invoice had no line items — created empty draft.";

  return {
    content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) + draftReminder() }],
  };
}
