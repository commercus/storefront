/**
 * An answer of the storefront API that is not a success. `status` is the HTTP status; `detail` the
 * API's explanation (in English, for developers: show your own text to visitors).
 *
 * Statuses worth handling: 409 (not enough stock, or the cart was checked out), 404 (an unknown or
 * expired cart, product or order), 422 (a variant that is not for sale, or an Idempotency-Key reused
 * for another request).
 */
export class StorefrontError extends Error {
  readonly status: number;
  readonly detail: string | undefined;

  constructor(status: number, detail?: string) {
    super(detail ? `${status}: ${detail}` : `Storefront API answered ${status}`);
    this.name = "StorefrontError";
    this.status = status;
    this.detail = detail;
  }

  /** Not enough stock for what was asked. */
  get outOfStock(): boolean {
    return this.status === 409;
  }
}
