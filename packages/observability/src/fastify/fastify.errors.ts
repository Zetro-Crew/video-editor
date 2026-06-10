export interface HttpErrorOptions {
	statusCode: number;
	message: string;
	expose?: boolean;
	cause?: unknown;
	details?: unknown;
}

export class HttpError extends Error {
	readonly statusCode: number;
	readonly expose: boolean;
	readonly details?: unknown;

	constructor(opts: HttpErrorOptions) {
		super(opts.message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
		this.name = "HttpError";
		this.statusCode = opts.statusCode;
		this.expose = opts.expose ?? (opts.statusCode >= 400 && opts.statusCode < 500);
		this.details = opts.details;
	}
}
