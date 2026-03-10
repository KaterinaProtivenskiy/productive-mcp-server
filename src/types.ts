/** JSON:API list response */
export interface JsonApiListDocument {
  data: JsonApiResource[];
  included?: JsonApiResource[];
  meta?: JsonApiMeta;
  links?: JsonApiLinks;
}

/** JSON:API single resource response */
export interface JsonApiSingleDocument {
  data: JsonApiResource;
  included?: JsonApiResource[];
  meta?: JsonApiMeta;
  links?: JsonApiLinks;
}

export interface JsonApiResource {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
  relationships?: Record<string, JsonApiRelationship>;
  links?: Record<string, string>;
}

export interface JsonApiRelationship {
  data?: { id: string; type: string } | { id: string; type: string }[] | null;
  meta?: Record<string, unknown>;
  links?: Record<string, string>;
}

export interface JsonApiMeta {
  current_page?: number;
  total_pages?: number;
  total_count?: number;
  page_size?: number;
  [key: string]: unknown;
}

export interface JsonApiLinks {
  first?: string;
  last?: string;
  next?: string;
  prev?: string;
  self?: string;
}

export interface JsonApiError {
  status: string;
  title: string;
  detail?: string;
  source?: { pointer?: string; parameter?: string };
}

/** Parameters for list requests */
export interface ListParams {
  page?: number;
  pageSize?: number;
  filters?: Record<string, string | number | boolean>;
  sort?: string;
  include?: string;
}

/** Parameters for create/update requests */
export interface MutationBody {
  type: string;
  id?: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<
    string,
    { data: { type: string; id: string } | null }
  >;
}
