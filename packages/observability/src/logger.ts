import Pino, {
	destination,
	type Logger as PinoLogger,
	stdSerializers,
	stdTimeFunctions,
} from "pino";
import type { LoggerPort, ZBaseConfig } from "./config.type.js";

const createPinoInstance = (config: ZBaseConfig): PinoLogger => {
	const { customDestination, serviceName, level } = config;

	return Pino(
		{
			formatters: {
				level: (_label, number) => ({ level: number }),
			},
			level: level ?? process.env.LOG_LEVEL ?? "info",
			serializers: { err: stdSerializers.err },
			timestamp: stdTimeFunctions.isoTime,
			base: { serviceName },
		},
		customDestination ?? destination(1),
	);
};

export class LoggerManager implements LoggerPort {
	private instance: PinoLogger;

	private constructor(instance: PinoLogger) {
		this.instance = instance;
	}

	static create(config: ZBaseConfig): LoggerManager {
		const pinoInstance = createPinoInstance(config);

		return new LoggerManager(pinoInstance);
	}

	getInstance(): PinoLogger {
		return this.instance;
	}

	createChild(metadata: object): LoggerPort {
		return new LoggerManager(this.instance.child(metadata));
	}

	configure(config: ZBaseConfig): void {
		this.instance = createPinoInstance(config);
	}

	logInfo(msg: string, info?: object): void {
		this.instance.info({ info }, msg);
	}

	logError(msg: string, err: Error, info?: object): void {
		this.instance.error({ info, err }, msg);
	}

	logWarning(msg: string, info?: object): void {
		this.instance.warn({ info }, msg);
	}

	setLevel(level: "silent" | "error" | "warn" | "info" | "debug" | "trace"): void {
		this.instance.level = level;
	}
}

export const InternalLogger = LoggerManager.create({});
export const Logger = InternalLogger as LoggerPort;
