import type { DestinationStream, Logger } from "pino";

export interface LoggerPort {
	logError: (msg: string, err: Error, info?: object) => void;
	logWarning: (msg: string, info?: object) => void;
	logInfo: (msg: string, info?: object) => void;
	createChild: (metadata: object) => LoggerPort;
	setLevel: (level: "silent" | "error" | "warn" | "info" | "debug" | "trace") => void;
	getInstance: () => Logger;
}

export interface ZOtelConfig {
	serviceVersion: string;
	otelEndpoint: string;
	serviceName: string;
	logLevel?: string;
	pyroscopeServerAddress?: string;
	samplingRatio?: number;
}

export interface ZBaseConfig {
	customDestination?: DestinationStream;
	serviceName?: string;
	level?: string;
}
