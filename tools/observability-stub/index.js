// No-op stand-in for the main entry of @ztube/observability.
// See README.md for why this exists. All exports are behaviour-free: they
// satisfy the shapes apps/server imports so type-check, tests, lint, and a
// frozen install pass on open-network CI without the internal registry.

function noop() {}

export function initTelemetry() {}

function createNoopLogger() {
	const logger = {
		level: "info",
		silent: noop,
		fatal: noop,
		error: noop,
		warn: noop,
		info: noop,
		debug: noop,
		trace: noop,
		child() {
			return logger;
		},
	};
	return logger;
}

const sharedLogger = createNoopLogger();

export const Logger = {
	logInfo: noop,
	logError: noop,
	logWarning: noop,
	getInstance() {
		return sharedLogger;
	},
};

export const metricsService = {
	recordHistogram: noop,
};

const noopSpan = {
	setAttribute: noop,
	setAttributes: noop,
};

export async function addCustomSpan(_name, callback) {
	return callback(noopSpan);
}

export function createZMonitor() {
	return {
		logStarted: noop,
		logRetry: noop,
		logSuccess: noop,
		logAborting: noop,
	};
}
