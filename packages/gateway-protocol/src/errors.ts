export type GatewayErrorCode =
  | 'AUTH_FAILED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | (string & {});

export interface GatewayError {
  code: GatewayErrorCode;
  message: string;
  details?: unknown;
}

