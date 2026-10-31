/** A request the API declines on purpose: an HTTP status, a stable reason code and a sentence for people. */
export class Refusal extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 428,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
