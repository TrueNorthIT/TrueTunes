export interface FetchRequest {
  operationId: string;
  pathParams?: Record<string, string>;
  query?: Record<string, string | undefined>;
  body?: unknown;
}

export interface FetchResponse {
  data?: unknown;
  error?: string;
}
