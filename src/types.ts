export interface FetchRequest {
  operationId: string;
  pathParams?: Record<string, string>;
  query?: Record<string, string | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface FetchResponse {
  data?: unknown;
  error?: string;
  etag?: string;
}
