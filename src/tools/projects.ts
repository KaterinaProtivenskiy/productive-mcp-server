import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../services/productive.js";
import { paginationSchema, sortSchema } from "../schemas/common.js";
import type { JsonApiResource } from "../types.js";

function formatProject(p: JsonApiResource): Record<string, unknown> {
  return {
    id: p.id,
    name: p.attributes.name,
    number: p.attributes.project_number,
    project_type_id: p.attributes.project_type_id,
    archived_at: p.attributes.archived_at,
    created_at: p.attributes.created_at,
    last_activity_at: p.attributes.last_activity_at,
    company_id: (p.relationships?.company?.data as { id: string } | null)?.id,
    project_manager_id: (
      p.relationships?.project_manager?.data as { id: string } | null
    )?.id,
  };
}

export function registerProjectTools(server: McpServer): void {
  server.registerTool("productive_list_projects", {
    title: "List Projects",
    description:
      "List and search Productive.io projects. Supports filtering by company, project type, and archived status. " +
      "Use this to find project IDs needed for other tools like productive_list_tasks or productive_list_deals.",
    inputSchema: z.object({
      ...paginationSchema,
      ...sortSchema,
      company_id: z
        .string()
        .optional()
        .describe("Filter by company ID"),
      project_type_id: z
        .number()
        .optional()
        .describe("Filter by project type (1=internal, 2=client)"),
      status: z
        .number()
        .optional()
        .describe("Filter by status (1=active, 2=archived)"),
      query: z
        .string()
        .optional()
        .describe("Search projects by name"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const filters: Record<string, string | number | boolean> = {};
      if (args.company_id) filters.company_id = args.company_id;
      if (args.project_type_id) filters.project_type = args.project_type_id;
      if (args.status) filters.status = args.status;
      if (args.query) filters.query = args.query;

      const result = await client.list("projects", {
        page: args.page,
        pageSize: args.page_size,
        filters,
        sort: args.sort,
      });

      const projects = Array.isArray(result.data)
        ? result.data.map(formatProject)
        : [];

      const response = {
        projects,
        total_count: result.meta?.total_count ?? projects.length,
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
            text: `Error listing projects: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  server.registerTool("productive_get_project", {
    title: "Get Project",
    description:
      "Get a single Productive.io project by ID with full details. " +
      "Optionally include related resources like company, project_manager, and workflow.",
    inputSchema: z.object({
      id: z.string().describe("The project ID"),
      include: z
        .string()
        .optional()
        .describe(
          "Comma-separated related resources to include (e.g. 'company,project_manager,workflow')"
        ),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const result = await client.get("projects", args.id, args.include);
      const project = !Array.isArray(result.data)
        ? formatProject(result.data)
        : null;

      const response: Record<string, unknown> = { project };
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
            text: `Error getting project (ID: ${args.id}): ${error instanceof Error ? error.message : String(error)}. Use productive_list_projects to find valid IDs.`,
          },
        ],
        isError: true,
      };
    }
  });

  server.registerTool("productive_create_project", {
    title: "Create Project",
    description:
      "Create a new project in Productive.io. Requires a name and project_type_id. " +
      "Optionally associate with a company. Use productive_list_companies to find company IDs.",
    inputSchema: z.object({
      name: z.string().describe("Project name"),
      project_type_id: z
        .number()
        .describe("Project type (1=internal, 2=client)"),
      company_id: z
        .string()
        .optional()
        .describe("Company ID to associate with this project"),
      workflow_id: z
        .string()
        .optional()
        .describe("Workflow ID for the project"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const body: {
        type: string;
        attributes: Record<string, unknown>;
        relationships?: Record<string, { data: { type: string; id: string } }>;
      } = {
        type: "projects",
        attributes: {
          name: args.name,
          project_type_id: args.project_type_id,
        },
        relationships: {},
      };

      if (args.company_id) {
        body.relationships!.company = {
          data: { type: "companies", id: args.company_id },
        };
      }
      if (args.workflow_id) {
        body.relationships!.workflow = {
          data: { type: "workflows", id: args.workflow_id },
        };
      }

      const result = await client.create("projects", body);
      const project = !Array.isArray(result.data)
        ? formatProject(result.data)
        : null;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ project, message: "Project created successfully" }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error creating project: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  server.registerTool("productive_update_project", {
    title: "Update Project",
    description:
      "Update an existing Productive.io project. Use productive_get_project first to see current values.",
    inputSchema: z.object({
      id: z.string().describe("The project ID to update"),
      name: z.string().optional().describe("New project name"),
      project_type_id: z
        .number()
        .optional()
        .describe("New project type (1=internal, 2=client)"),
      project_manager_id: z
        .string()
        .optional()
        .describe("New project manager person ID"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const attributes: Record<string, unknown> = {};
      if (args.name !== undefined) attributes.name = args.name;
      if (args.project_type_id !== undefined)
        attributes.project_type_id = args.project_type_id;

      const body: {
        type: string;
        id: string;
        attributes: Record<string, unknown>;
        relationships?: Record<string, { data: { type: string; id: string } }>;
      } = {
        type: "projects",
        id: args.id,
        attributes,
      };

      if (args.project_manager_id) {
        body.relationships = {
          project_manager: {
            data: { type: "people", id: args.project_manager_id },
          },
        };
      }

      const result = await client.update("projects", args.id, body);
      const project = !Array.isArray(result.data)
        ? formatProject(result.data)
        : null;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ project, message: "Project updated successfully" }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error updating project (ID: ${args.id}): ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });
}
