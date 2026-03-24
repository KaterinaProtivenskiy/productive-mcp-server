# Productive.io MCP Server

An MCP (Model Context Protocol) server for [Productive.io](https://productive.io) that enables AI assistants like Claude to interact with your Productive.io workspace — managing projects, tasks, time entries, budgets, and more.

Supports two transport modes:
- **stdio** (default) — Claude launches it as a local subprocess
- **HTTP** (with `--http` flag) — runs as an Express web server for remote/team use

## Prerequisites

- **Node.js 18+**
- A **Productive.io** account with API access
- **API Token** — generate one in Productive.io under Settings → API integrations
- **Organization ID** — found in your Productive.io account settings

## Installation

```bash
git clone <your-repo-url> productive-mcp-server
cd productive-mcp-server
npm install
cp .env.example .env
# Edit .env with your credentials
npm run build
```

## Configuration

| Variable | Required | Description |
|---|---|---|
| `PRODUCTIVE_API_TOKEN` | Yes | Your Productive.io API token |
| `PRODUCTIVE_ORG_ID` | Yes | Your Productive.io organization ID |
| `PORT` | No | HTTP server port (default: 3000) |

## Running

### stdio mode (default — for local use)

```bash
# Development
npm run dev

# Production (after build)
npm start
```

### HTTP mode (for remote/team use)

```bash
# Development
npm run dev:http

# Production (after build)
npm run start:http
```

The HTTP server exposes:
- `POST /mcp` — MCP protocol endpoint
- `GET /health` — health check

## Connecting to Claude Desktop

Add this to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "productive": {
      "command": "node",
      "args": ["/absolute/path/to/productive-mcp-server/dist/index.js"],
      "env": {
        "PRODUCTIVE_API_TOKEN": "your_api_token_here",
        "PRODUCTIVE_ORG_ID": "your_org_id_here"
      }
    }
  }
}
```

## Connecting to Claude Code

### stdio mode

```bash
claude mcp add productive -- node /absolute/path/to/productive-mcp-server/dist/index.js
```

Set the environment variables before running Claude Code, or add them to your shell profile:

```bash
export PRODUCTIVE_API_TOKEN=your_api_token_here
export PRODUCTIVE_ORG_ID=your_org_id_here
```

### HTTP mode

Start the server first:

```bash
cd /path/to/productive-mcp-server
PRODUCTIVE_API_TOKEN=your_token PRODUCTIVE_ORG_ID=your_org npm run start:http
```

Then connect Claude Code:

```bash
claude mcp add productive --transport http http://localhost:3000/mcp
```

## Connecting to VS Code

Add to your VS Code user settings JSON (`.vscode/settings.json` or user settings):

### stdio mode

```json
{
  "mcp": {
    "servers": {
      "productive": {
        "command": "node",
        "args": ["/absolute/path/to/productive-mcp-server/dist/index.js"],
        "env": {
          "PRODUCTIVE_API_TOKEN": "your_api_token_here",
          "PRODUCTIVE_ORG_ID": "your_org_id_here"
        }
      }
    }
  }
}
```

### HTTP mode

```json
{
  "mcp": {
    "servers": {
      "productive": {
        "type": "http",
        "url": "http://localhost:3000/mcp"
      }
    }
  }
}
```

## Available Tools

| Tool | Description | Key Parameters |
|---|---|---|
| `productive_list_projects` | List/search projects | `company_id`, `project_type_id`, `status`, `query` |
| `productive_get_project` | Get project by ID | `id`, `include` |
| `productive_create_project` | Create a project | `name`, `project_type_id`, `company_id` |
| `productive_update_project` | Update a project | `id`, `name`, `project_type_id` |
| `productive_list_tasks` | List/filter tasks | `project_id`, `assignee_id`, `status`, `query` |
| `productive_get_task` | Get task by ID | `id`, `include` |
| `productive_create_task` | Create a task | `title`, `task_list_id`, `assignee_id` |
| `productive_update_task` | Update a task | `id`, `title`, `closed`, `assignee_id` |
| `productive_list_time_entries` | List time entries | `person_id`, `project_id`, `after`, `before` |
| `productive_log_time` | Log a time entry | `person_id`, `service_id`, `date`, `time` |
| `productive_list_people` | List team members | `status`, `company_id`, `query` |
| `productive_get_person` | Get person by ID | `id`, `include` |
| `productive_list_deals` | List budgets/deals | `project_id`, `company_id`, `deal_status` |
| `productive_get_deal` | Get deal by ID | `id`, `include` |
| `productive_list_companies` | List companies | `status`, `query` |
| `productive_get_company` | Get company by ID | `id`, `include` |
| `productive_list_bookings` | List bookings | `person_id`, `project_id`, `after`, `before` |
| `productive_list_services` | List services | `deal_id` |

### Invoicing Tools (Draft Only)

All invoice tools create and manage **draft invoices only**. Finalization (assigning an invoice number) must always be done manually in the Productive.io UI.

| Tool | Description | Key Parameters |
|---|---|---|
| `productive_list_invoices` | List/filter invoices | `company_id`, `deal_id`, `invoice_status`, date range |
| `productive_get_invoice` | Get full invoice details with line items | `id` |
| `productive_create_invoice` | Create a new empty draft invoice | `company_id`, `document_type_id`, `subsidiary_id` |
| `productive_update_invoice` | Update a draft invoice | `id`, `subject`, `note`, dates |
| `productive_create_invoice_from_previous` | Clone an invoice (line items + budget links) | `source_invoice_id`, optional overrides |
| `productive_create_invoice_like_last_for_client` | Clone a client's most recent invoice | `company_id`, `how_many_back` |
| `productive_list_line_items` | List line items for an invoice | `invoice_id` |
| `productive_create_line_item` | Add a line item to a draft invoice | `invoice_id`, `description`, `quantity`, `unit_price`, `unit_id` |
| `productive_update_line_item` | Update an existing line item | `id`, `description`, `quantity`, `unit_price` |
| `productive_delete_line_item` | Delete a line item | `id` |
| `productive_list_invoice_attributions` | List budget links for an invoice | `invoice_id` |
| `productive_create_invoice_attribution` | Link a draft invoice to a budget | `invoice_id`, `deal_id`, `amount` |
| `productive_list_document_types` | List available document types | `subsidiary_id`, `status` |
| `productive_list_subsidiaries` | List your company subsidiaries | `status` |
| `productive_list_tax_rates` | List available tax rates | `status` |

All list tools support `page`, `page_size`, and `sort` parameters.

## Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

This opens an interactive UI to test each tool.

## Rate Limits

Productive.io enforces:
- 100 requests per 10 seconds
- 4,000 requests per 30 minutes

The server implements automatic retry with exponential backoff for 429 responses (up to 3 retries).

## License
