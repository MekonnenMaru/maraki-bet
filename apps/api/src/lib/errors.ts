export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export class ProviderError extends HttpError {
  constructor(status: number, message: string, details?: unknown) {
    super(status, message, details);
  }
}
