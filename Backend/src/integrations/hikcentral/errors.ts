export interface HikCentralErrorContext {
  method?: string;
  apiPath?: string;
  baseUrl?: string;
  status?: number;
  code?: unknown;
  message?: string;
  requestId?: string;
  attempt?: number;
}

export class HikCentralIntegrationError extends Error {
  public readonly context: HikCentralErrorContext;
  public readonly cause?: unknown;

  constructor(message: string, context: HikCentralErrorContext = {}, cause?: unknown) {
    super(message);
    this.name = 'HikCentralIntegrationError';
    this.context = context;
    this.cause = cause;
  }
}

