// No-op stand-in for the @ztube/observability/fastify subpath.

export class HttpError extends Error {
	constructor(options) {
		super(options.message, options.cause !== undefined ? { cause: options.cause } : undefined);
		this.name = "HttpError";
		this.statusCode = options.statusCode;
		this.expose = options.expose ?? options.statusCode < 500;
		this.details = options.details;
	}
}

// The real plugin installs request/response/error logging hooks. The stub does
// nothing — Fastify's own setErrorHandler in createFastifyInstance() still maps
// HttpError to the right status, which is all CI tests assert on.
export async function fastifyLoggingPlugin() {}
