import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerTaskTools } from "./tools/tasks.js";
import { registerTimeEntryTools } from "./tools/time-entries.js";
import { registerPeopleTools } from "./tools/people.js";
import { registerDealTools } from "./tools/deals.js";
import { registerCompanyTools } from "./tools/companies.js";
import { registerBookingTools } from "./tools/bookings.js";
import { registerServiceTools } from "./tools/services.js";
import { registerInvoiceTools } from "./tools/invoices.js";
import { registerLineItemTools } from "./tools/line-items.js";
import { registerInvoiceAttributionTools } from "./tools/invoice-attributions.js";
import { registerDocumentTypeTools } from "./tools/document-types.js";
import { registerSubsidiaryTools } from "./tools/subsidiaries.js";
import { registerTaxRateTools } from "./tools/tax-rates.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "productive-mcp-server",
    version: "1.0.0",
  });

  registerProjectTools(server);
  registerTaskTools(server);
  registerTimeEntryTools(server);
  registerPeopleTools(server);
  registerDealTools(server);
  registerCompanyTools(server);
  registerBookingTools(server);
  registerServiceTools(server);
  registerInvoiceTools(server);
  registerLineItemTools(server);
  registerInvoiceAttributionTools(server);
  registerDocumentTypeTools(server);
  registerSubsidiaryTools(server);
  registerTaxRateTools(server);

  return server;
}
