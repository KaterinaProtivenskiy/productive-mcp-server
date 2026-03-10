import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../services/productive.js";
import { paginationSchema, sortSchema } from "../schemas/common.js";
import type { JsonApiResource } from "../types.js";

function formatTask(t: JsonApiResource): Record<string, unknown> {
  return {
    id: t.id,
    title: t.attributes.title,
    number: t.attributes.task_number,
    description: t.attributes.description,
    due_date: t.attributes.due_date,
    start_date: t.attributes.start_date,
    closed: t.attributes.closed,
    closed_at: t.attributes.closed_at,
    created_at: t.attributes.created_at,
    updated_at: t.attributes.updated_at,
    initial_estimate: t.attributes.initial_estimate,
    remaining_time: t.attributes.remaining_time,
    worked_time: t.attributes.worked_time,
    tag_list: t.attributes.tag_list,
    todo_count: t.attributes.todo_count,
    subtask_count: t.attributes.subtask_count,
    project_id: (t.relationships?.project?.data as { id: string } | null)?.id,
    task_list_id: (t.relationships?.task_list?.data as { id: string } | null)
      ?.id,
    assignee_id: (t.relationships?.assignee?.data as { id: string } | null)
      ?.id,
  };
}

export function registerTaskTools(server: McpServer): void {
  server.registerTool("productive_list_tasks", {
    title: "List Tasks",
    description:
      "List and filter tasks in Productive.io. Filter by project, assignee, task list, board, or status. " +
      "Status values: 1=open, 2=closed. Use this to find task IDs and task_list IDs.",
    inputSchema: z.object({
      ...paginationSchema,
      ...sortSchema,
      project_id: z
        .string()
        .optional()
        .describe("Filter by project ID"),
      assignee_id: z
        .string()
        .optional()
        .describe("Filter by assignee person ID"),
      task_list_id: z
        .string()
        .optional()
        .describe("Filter by task list ID"),
      status: z
        .number()
        .optional()
        .describe("Filter by status (1=open, 2=closed)"),
      query: z
        .string()
        .optional()
        .describe("Search tasks by title"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const filters: Record<string, string | number | boolean> = {};
      if (args.project_id) filters.project_id = args.project_id;
      if (args.assignee_id) filters.assignee_id = args.assignee_id;
      if (args.task_list_id) filters.task_list_id = args.task_list_id;
      if (args.status) filters.status = args.status;
      if (args.query) filters.query = args.query;

      const result = await client.list("tasks", {
        page: args.page,
        pageSize: args.page_size,
        filters,
        sort: args.sort,
      });

      const tasks = Array.isArray(result.data)
        ? result.data.map(formatTask)
        : [];

      const response = {
        tasks,
        total_count: result.meta?.total_count ?? tasks.length,
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
            text: `Error listing tasks: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  server.registerTool("productive_get_task", {
    title: "Get Task",
    description:
      "Get a single task by ID from Productive.io with full details including description, dates, and time tracking info.",
    inputSchema: z.object({
      id: z.string().describe("The task ID"),
      include: z
        .string()
        .optional()
        .describe(
          "Comma-separated related resources to include (e.g. 'project,assignee,task_list')"
        ),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const result = await client.get("tasks", args.id, args.include);
      const task = !Array.isArray(result.data)
        ? formatTask(result.data)
        : null;

      const response: Record<string, unknown> = { task };
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
            text: `Error getting task (ID: ${args.id}): ${error instanceof Error ? error.message : String(error)}. Use productive_list_tasks to find valid IDs.`,
          },
        ],
        isError: true,
      };
    }
  });

  server.registerTool("productive_create_task", {
    title: "Create Task",
    description:
      "Create a new task in Productive.io. Requires a title and task_list_id (which belongs to a project). " +
      "Use productive_list_tasks with a project_id to find available task_list IDs.",
    inputSchema: z.object({
      title: z.string().describe("Task title"),
      task_list_id: z
        .string()
        .describe(
          "Task list ID (required). Use productive_list_tasks with project_id to find task list IDs."
        ),
      description: z
        .string()
        .optional()
        .describe("Task description (supports markdown)"),
      due_date: z
        .string()
        .optional()
        .describe("Due date in YYYY-MM-DD format"),
      start_date: z
        .string()
        .optional()
        .describe("Start date in YYYY-MM-DD format"),
      assignee_id: z
        .string()
        .optional()
        .describe("Person ID to assign. Use productive_list_people to find IDs."),
      project_id: z
        .string()
        .optional()
        .describe("Project ID the task belongs to"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const body: {
        type: string;
        attributes: Record<string, unknown>;
        relationships: Record<string, { data: { type: string; id: string } }>;
      } = {
        type: "tasks",
        attributes: {
          title: args.title,
        },
        relationships: {
          task_list: {
            data: { type: "task_lists", id: args.task_list_id },
          },
        },
      };

      if (args.description) body.attributes.description = args.description;
      if (args.due_date) body.attributes.due_date = args.due_date;
      if (args.start_date) body.attributes.start_date = args.start_date;

      if (args.assignee_id) {
        body.relationships.assignee = {
          data: { type: "people", id: args.assignee_id },
        };
      }
      if (args.project_id) {
        body.relationships.project = {
          data: { type: "projects", id: args.project_id },
        };
      }

      const result = await client.create("tasks", body);
      const task = !Array.isArray(result.data)
        ? formatTask(result.data)
        : null;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ task, message: "Task created successfully" }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error creating task: ${error instanceof Error ? error.message : String(error)}. ` +
              "Ensure task_list_id is valid. Use productive_list_tasks with a project_id to find task list IDs.",
          },
        ],
        isError: true,
      };
    }
  });

  server.registerTool("productive_update_task", {
    title: "Update Task",
    description:
      "Update an existing task in Productive.io. Use productive_get_task first to see current values.",
    inputSchema: z.object({
      id: z.string().describe("The task ID to update"),
      title: z.string().optional().describe("New task title"),
      description: z
        .string()
        .optional()
        .describe("New task description"),
      due_date: z
        .string()
        .optional()
        .describe("New due date in YYYY-MM-DD format"),
      start_date: z
        .string()
        .optional()
        .describe("New start date in YYYY-MM-DD format"),
      closed: z
        .boolean()
        .optional()
        .describe("Set to true to close the task, false to reopen"),
      assignee_id: z
        .string()
        .optional()
        .describe("New assignee person ID"),
    }),
  }, async (args) => {
    try {
      const client = getClient();
      const attributes: Record<string, unknown> = {};
      if (args.title !== undefined) attributes.title = args.title;
      if (args.description !== undefined)
        attributes.description = args.description;
      if (args.due_date !== undefined) attributes.due_date = args.due_date;
      if (args.start_date !== undefined)
        attributes.start_date = args.start_date;
      if (args.closed !== undefined) attributes.closed = args.closed;

      const body: {
        type: string;
        id: string;
        attributes: Record<string, unknown>;
        relationships?: Record<string, { data: { type: string; id: string } }>;
      } = {
        type: "tasks",
        id: args.id,
        attributes,
      };

      if (args.assignee_id) {
        body.relationships = {
          assignee: {
            data: { type: "people", id: args.assignee_id },
          },
        };
      }

      const result = await client.update("tasks", args.id, body);
      const task = !Array.isArray(result.data)
        ? formatTask(result.data)
        : null;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ task, message: "Task updated successfully" }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error updating task (ID: ${args.id}): ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });
}
