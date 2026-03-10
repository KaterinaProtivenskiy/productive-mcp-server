import {
  API_BASE_URL,
  MAX_RETRIES,
  RETRY_BASE_DELAY_MS,
  DEFAULT_PAGE_SIZE,
} from "../constants.js";
import type {
  JsonApiListDocument,
  JsonApiSingleDocument,
  ListParams,
  MutationBody,
} from "../types.js";

export class ProductiveClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(apiToken: string, orgId: string) {
    this.baseUrl = API_BASE_URL;
    this.headers = {
      "Content-Type": "application/vnd.api+json",
      "X-Auth-Token": apiToken,
      "X-Organization-Id": orgId,
    };
  }

  /** GET a list of resources */
  async list(
    endpoint: string,
    params?: ListParams
  ): Promise<JsonApiListDocument> {
    const url = this.buildListUrl(endpoint, params);
    const response = await this.request("GET", url);
    return response as JsonApiListDocument;
  }

  /** GET a single resource by ID */
  async get(
    endpoint: string,
    id: string,
    include?: string
  ): Promise<JsonApiSingleDocument> {
    let url = `${this.baseUrl}/${endpoint}/${id}`;
    if (include) {
      url += `?include=${encodeURIComponent(include)}`;
    }
    const response = await this.request("GET", url);
    return response as JsonApiSingleDocument;
  }

  /** POST to create a new resource */
  async create(
    endpoint: string,
    body: MutationBody
  ): Promise<JsonApiSingleDocument> {
    const url = `${this.baseUrl}/${endpoint}`;
    const response = await this.request("POST", url, { data: body });
    return response as JsonApiSingleDocument;
  }

  /** PATCH to update an existing resource */
  async update(
    endpoint: string,
    id: string,
    body: MutationBody
  ): Promise<JsonApiSingleDocument> {
    const url = `${this.baseUrl}/${endpoint}/${id}`;
    const response = await this.request("PATCH", url, { data: body });
    return response as JsonApiSingleDocument;
  }

  private buildListUrl(endpoint: string, params?: ListParams): string {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? DEFAULT_PAGE_SIZE;
    url.searchParams.set("page[number]", String(page));
    url.searchParams.set("page[size]", String(pageSize));

    if (params?.filters) {
      for (const [key, value] of Object.entries(params.filters)) {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(`filter[${key}]`, String(value));
        }
      }
    }

    if (params?.sort) {
      url.searchParams.set("sort", params.sort);
    }

    if (params?.include) {
      url.searchParams.set("include", params.include);
    }

    return url.toString();
  }

  private async request(
    method: string,
    url: string,
    body?: unknown
  ): Promise<unknown> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const options: RequestInit = {
          method,
          headers: this.headers,
        };

        if (body) {
          options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);

        if (response.status === 429) {
          if (attempt < MAX_RETRIES) {
            const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
            console.error(
              `Rate limited (429). Retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`
            );
            await this.sleep(delay);
            continue;
          }
          throw new Error(
            `Rate limited after ${MAX_RETRIES} retries. Please wait and try again.`
          );
        }

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(
            `Productive API error ${response.status}: ${errorBody}`
          );
        }

        if (response.status === 204) {
          return {};
        }

        return await response.json();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (
          attempt < MAX_RETRIES &&
          lastError.message.includes("Rate limited")
        ) {
          continue;
        }
        if (attempt < MAX_RETRIES && this.isRetryable(lastError)) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          console.error(
            `Request failed. Retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`
          );
          await this.sleep(delay);
          continue;
        }
        throw lastError;
      }
    }

    throw lastError ?? new Error("Request failed after retries");
  }

  private isRetryable(error: Error): boolean {
    return (
      error.message.includes("ECONNRESET") ||
      error.message.includes("ETIMEDOUT") ||
      error.message.includes("fetch failed")
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

let clientInstance: ProductiveClient | null = null;

export function getClient(): ProductiveClient {
  if (!clientInstance) {
    const apiToken = process.env.PRODUCTIVE_API_TOKEN;
    const orgId = process.env.PRODUCTIVE_ORG_ID;

    if (!apiToken) {
      throw new Error(
        "PRODUCTIVE_API_TOKEN environment variable is required. " +
          "Set it in your .env file or pass it via the MCP server config."
      );
    }
    if (!orgId) {
      throw new Error(
        "PRODUCTIVE_ORG_ID environment variable is required. " +
          "Set it in your .env file or pass it via the MCP server config."
      );
    }

    clientInstance = new ProductiveClient(apiToken, orgId);
  }
  return clientInstance;
}
