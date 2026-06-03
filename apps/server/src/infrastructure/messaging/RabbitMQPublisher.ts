import { randomUUID } from "node:crypto";
import {
	type Envelope,
	EXCHANGE_NAME,
	EXPORT_COMPLETED,
	EXPORT_COMPLETED_V1,
	EXPORT_FAILED,
	EXPORT_FAILED_V1,
	EXPORT_STARTED,
	EXPORT_STARTED_V1,
	type ExportCompletedData,
	type ExportFailedData,
	type ExportStartedData,
	X_EVENT_NAME,
	X_EVENT_VERSION,
} from "@video-editor/contract/events";
import { Logger } from "@ztube/observability";
import type { ChannelModel, ConfirmChannel, RecoveringChannelModel } from "amqplib";
import { connect } from "amqplib";
import type { MonitorFactory } from "./MonitorFactory.ts";
import { COMMANDS_EXCHANGE } from "./schemas/commands.ts";
import { assertRenderTopology } from "./topology.ts";

export interface ExportEventPublisherPort {
	publishExportStarted(event: ExportStartedData): Promise<void>;
	publishExportCompleted(event: ExportCompletedData): Promise<void>;
	publishExportFailed(event: ExportFailedData): Promise<void>;
}

export type { ExportCompletedData, ExportFailedData, ExportStartedData };

export class UnroutedError extends Error {
	constructor(routingKey: string) {
		super(`Message published to '${routingKey}' returned unrouted (no bound queue)`);
		this.name = "UnroutedError";
	}
}

export class ChannelClosedError extends Error {
	constructor() {
		super("Publish channel was closed before broker confirmation");
		this.name = "ChannelClosedError";
	}
}

export class PublishExhaustedError extends Error {
	readonly attempts: number;
	readonly cause: Error;
	constructor(eventName: string, attempts: number, cause: Error) {
		super(`Failed to publish '${eventName}' after ${attempts} attempts: ${cause.message}`);
		this.name = "PublishExhaustedError";
		this.attempts = attempts;
		this.cause = cause;
	}
}

class ConfirmTimeoutError extends Error {
	constructor(routingKey: string, timeoutMs: number) {
		super(`Broker confirm for '${routingKey}' did not arrive within ${timeoutMs}ms`);
		this.name = "ConfirmTimeoutError";
	}
}

interface Inflight {
	settle: (err?: Error) => void;
}

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (err: Error) => void;
}

function makeDeferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (err: Error) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	// Prevent "unhandled rejection" if nobody awaits the deferred before it rejects
	// (e.g. close() shooting down a channelReady that no publish is currently watching).
	promise.catch(() => {});
	return { promise, resolve, reject };
}

interface AmqpErrorFields {
	code?: number;
	classId?: number;
	methodId?: number;
}

interface AmqpErrorLogFields {
	message: string;
	code?: number;
	classId?: number;
	methodId?: number;
}

function formatAmqpError(err: unknown): AmqpErrorLogFields {
	if (err instanceof Error) {
		const fields = err as Error & AmqpErrorFields;
		return {
			message: err.message,
			code: fields.code,
			classId: fields.classId,
			methodId: fields.methodId,
		};
	}
	return { message: String(err) };
}

const RETRY_BACKOFFS_MS = [200, 1000];
const DEFAULT_COMMAND_CONFIRM_TIMEOUT_MS = 10_000;
const DEFAULT_EVENT_CONFIRM_TIMEOUT_MS = 30_000;
const DEFAULT_INITIAL_CONNECT_TIMEOUT_MS = 15_000;
const RECOVERY_INITIAL_DELAY_MS = 1_000;
const RECOVERY_MAX_DELAY_MS = 30_000;
const RECOVERY_FACTOR = 2;
const RECOVERY_JITTER = 0.2;

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

export interface RabbitMQPublisherOptions {
	commandConfirmTimeoutMs?: number;
	eventConfirmTimeoutMs?: number;
	initialConnectTimeoutMs?: number;
	recoveryMaxDelayMs?: number;
	renderRequestTtlMs?: number;
	renderQueueMaxLength?: number;
	renderDeliveryLimit?: number;
	socketOptions?: { cert: Buffer; key: Buffer; ca: Buffer };
}

export class RabbitMQPublisher implements ExportEventPublisherPort {
	private readonly url: string;
	private readonly monitorFactory: MonitorFactory;
	private readonly commandConfirmTimeoutMs: number;
	private readonly eventConfirmTimeoutMs: number;
	private readonly initialConnectTimeoutMs: number;
	private readonly recoveryMaxDelayMs: number;
	private readonly renderRequestTtlMs?: number;
	private readonly renderQueueMaxLength: number;
	private readonly renderDeliveryLimit: number;
	private readonly socketOptions?: { cert: Buffer; key: Buffer; ca: Buffer };
	private model: RecoveringChannelModel | null = null;
	private channel: ConfirmChannel | null = null;
	private channelReady: Deferred<ConfirmChannel> | null = null;
	private inflight: Map<string, Inflight> = new Map();
	private reconnectCount = 0;
	private closed = false;

	constructor(url: string, monitorFactory: MonitorFactory, options: RabbitMQPublisherOptions = {}) {
		this.url = url;
		this.monitorFactory = monitorFactory;
		this.commandConfirmTimeoutMs =
			options.commandConfirmTimeoutMs ?? DEFAULT_COMMAND_CONFIRM_TIMEOUT_MS;
		this.eventConfirmTimeoutMs = options.eventConfirmTimeoutMs ?? DEFAULT_EVENT_CONFIRM_TIMEOUT_MS;
		this.initialConnectTimeoutMs =
			options.initialConnectTimeoutMs ?? DEFAULT_INITIAL_CONNECT_TIMEOUT_MS;
		this.recoveryMaxDelayMs = options.recoveryMaxDelayMs ?? RECOVERY_MAX_DELAY_MS;
		this.renderRequestTtlMs = options.renderRequestTtlMs;
		this.renderQueueMaxLength = options.renderQueueMaxLength ?? 10_000;
		this.renderDeliveryLimit = options.renderDeliveryLimit ?? 5;
		this.socketOptions = options.socketOptions;
	}

	async connect(): Promise<void> {
		if (this.closed) throw new Error("RabbitMQPublisher is closed");
		if (this.model) return;

		// Fail-fast probe (no recovery): catches bad URL, bad credentials, and bad topology
		// at startup before the recovery wrapper hides them in an infinite retry loop.
		const probe = await this.openPlainWithTimeout();
		try {
			const ch = await probe.createConfirmChannel();
			await this.assertTopology(ch);
			await ch.close();
		} finally {
			await probe.close().catch(() => {});
		}

		const model = await this.openRecoveringWithTimeout();
		if (this.closed) {
			await model.close().catch(() => {});
			throw new Error("RabbitMQPublisher is closed");
		}
		this.model = model;
		this.attachModelListeners(model);
	}

	private async openPlainWithTimeout(): Promise<ChannelModel> {
		let timedOut = false;
		let timeoutHandle: NodeJS.Timeout | undefined;
		const connectPromise = connect(this.url, this.socketOptions);
		const timeoutPromise = new Promise<never>((_, reject) => {
			timeoutHandle = setTimeout(() => {
				timedOut = true;
				reject(new Error(`AMQP initial connect timed out after ${this.initialConnectTimeoutMs}ms`));
			}, this.initialConnectTimeoutMs);
		});
		try {
			return await Promise.race([connectPromise, timeoutPromise]);
		} finally {
			if (timeoutHandle) clearTimeout(timeoutHandle);
			if (timedOut) {
				connectPromise.then(
					(m) => {
						void m.close().catch(() => {});
					},
					() => {},
				);
			}
		}
	}

	private async openRecoveringWithTimeout(): Promise<RecoveringChannelModel> {
		let timedOut = false;
		let timeoutHandle: NodeJS.Timeout | undefined;
		const connectPromise = connect(this.url, {
			...this.socketOptions,
			recovery: {
				initialDelay: RECOVERY_INITIAL_DELAY_MS,
				maxDelay: this.recoveryMaxDelayMs,
				factor: RECOVERY_FACTOR,
				jitter: RECOVERY_JITTER,
				maxRetries: Number.POSITIVE_INFINITY,
				setup: (model: ChannelModel) => this.runSetup(model),
			},
		});
		const timeoutPromise = new Promise<never>((_, reject) => {
			timeoutHandle = setTimeout(() => {
				timedOut = true;
				reject(
					new Error(`AMQP recovering connect timed out after ${this.initialConnectTimeoutMs}ms`),
				);
			}, this.initialConnectTimeoutMs);
		});
		try {
			return await Promise.race([connectPromise, timeoutPromise]);
		} finally {
			if (timeoutHandle) clearTimeout(timeoutHandle);
			if (timedOut) {
				connectPromise.then(
					(m) => {
						void m.close().catch(() => {});
					},
					() => {},
				);
			}
		}
	}

	async close(): Promise<void> {
		this.closed = true;
		const model = this.model;
		const channelReady = this.channelReady;
		this.channel = null;
		this.model = null;
		this.channelReady = null;
		if (channelReady) {
			channelReady.reject(new Error("RabbitMQPublisher is closed"));
		}
		try {
			await model?.close();
		} catch {}
	}

	async drain(timeoutMs: number): Promise<void> {
		const start = Date.now();
		while (this.inflight.size > 0) {
			if (Date.now() - start > timeoutMs) {
				for (const id of this.inflight.keys()) {
					Logger.logWarning("amqp_publish_drained_unconfirmed", { messageId: id });
				}
				return;
			}
			await sleep(25);
		}
	}

	private async runSetup(model: ChannelModel): Promise<void> {
		const ch = await model.createConfirmChannel();
		this.attachChannelListeners(ch);
		await this.assertTopology(ch);
		if (this.closed) {
			try {
				await ch.close();
			} catch {}
			return;
		}
		this.channel = ch;
		const deferred = this.channelReady;
		this.channelReady = null;
		if (deferred) deferred.resolve(ch);
	}

	private attachChannelListeners(ch: ConfirmChannel): void {
		ch.on("error", (err) => {
			Logger.logError(
				"amqp_publisher_channel_error",
				err instanceof Error ? err : new Error(String(err)),
				formatAmqpError(err),
			);
			if (this.channel === ch) {
				this.channel = null;
			}
		});
		ch.on("close", () => {
			if (this.channel === ch) {
				this.channel = null;
			}
			const snapshot = Array.from(this.inflight.entries());
			this.inflight.clear();
			for (const [, entry] of snapshot) {
				try {
					entry.settle(new ChannelClosedError());
				} catch (settleErr) {
					Logger.logError(
						"amqp_inflight_settle_threw",
						settleErr instanceof Error ? settleErr : new Error(String(settleErr)),
					);
				}
			}
			const model = this.model;
			if (!this.closed && model && !this.channelReady) {
				this.channelReady = makeDeferred<ConfirmChannel>();
				void this.recreateChannel(model);
			}
		});
		ch.on("handler-error", (err, eventName) => {
			Logger.logError(
				"amqp_publisher_channel_handler_error",
				err instanceof Error ? err : new Error(String(err)),
				{ handlerEvent: eventName },
			);
		});
		ch.on("return", (msg) => {
			const id = msg.properties.messageId as string | undefined;
			if (!id) return;
			const entry = this.inflight.get(id);
			if (!entry) return;
			this.inflight.delete(id);
			entry.settle(new UnroutedError(msg.fields.routingKey));
		});
	}

	private async recreateChannel(model: RecoveringChannelModel): Promise<void> {
		if (this.closed || this.model !== model) return;
		try {
			await this.runSetup(model as unknown as ChannelModel);
		} catch (err) {
			// Connection likely dying with the channel; leave channelReady pending so the
			// recovery wrapper's next setup resolves it after reconnect.
			Logger.logWarning("amqp_publisher_channel_recreate_failed", formatAmqpError(err));
		}
	}

	private attachModelListeners(model: RecoveringChannelModel): void {
		// The 'connect' event for the initial connection is emitted synchronously inside
		// _connect() before our await on openRecoveringWithTimeout() resolves, so we never
		// see it here. Every 'connect' fired afterwards is therefore a recovery.
		model.on("connect", () => {
			this.reconnectCount++;
			Logger.logInfo("amqp_publisher_recovered", { reconnectCount: this.reconnectCount });
		});
		model.on("disconnect", (err) => {
			Logger.logWarning("amqp_publisher_disconnected", formatAmqpError(err));
			this.channel = null;
			if (!this.channelReady) this.channelReady = makeDeferred<ConfirmChannel>();
		});
		model.on("reconnect-scheduled", (info: { attempt: number; delay: number; error: Error }) => {
			if (info.attempt === 1 || info.attempt % 10 === 0) {
				Logger.logWarning("amqp_publisher_reconnect_scheduled", {
					attempt: info.attempt,
					delayMs: info.delay,
					...formatAmqpError(info.error),
				});
			}
		});
		model.on("reconnect-failed", (err) => {
			Logger.logError(
				"amqp_publisher_reconnect_exhausted",
				err instanceof Error ? err : new Error(String(err)),
			);
		});
		model.on("error", (err) => {
			Logger.logError(
				"amqp_publisher_model_error",
				err instanceof Error ? err : new Error(String(err)),
				formatAmqpError(err),
			);
		});
		model.on("handler-error", (err, eventName) => {
			Logger.logError(
				"amqp_publisher_model_handler_error",
				err instanceof Error ? err : new Error(String(err)),
				{ handlerEvent: eventName },
			);
		});
	}

	private async assertTopology(ch: ConfirmChannel): Promise<void> {
		await assertRenderTopology(ch, {
			renderRequestTtlMs: this.renderRequestTtlMs,
			renderQueueMaxLength: this.renderQueueMaxLength,
			renderDeliveryLimit: this.renderDeliveryLimit,
		});
	}

	private async awaitChannel(timeoutMs: number): Promise<ConfirmChannel> {
		if (this.closed) throw new Error("RabbitMQPublisher is closed");
		if (this.channel) return this.channel;
		if (!this.channelReady) this.channelReady = makeDeferred<ConfirmChannel>();
		const deferred = this.channelReady;
		let timeoutHandle: NodeJS.Timeout | undefined;
		const timeoutPromise = new Promise<never>((_, reject) => {
			timeoutHandle = setTimeout(() => reject(new ChannelClosedError()), timeoutMs);
		});
		try {
			return await Promise.race([deferred.promise, timeoutPromise]);
		} finally {
			if (timeoutHandle) clearTimeout(timeoutHandle);
		}
	}

	private async publishOnce<TData>(
		exchange: string,
		routingKey: string,
		eventName: string,
		eventVersion: number,
		envelope: Envelope<TData>,
		confirmTimeoutMs: number,
	): Promise<void> {
		const ch = await this.awaitChannel(confirmTimeoutMs);
		const messageId = randomUUID();
		const payload = Buffer.from(JSON.stringify(envelope));

		return new Promise<void>((resolve, reject) => {
			let settled = false;
			let timeoutHandle: NodeJS.Timeout | undefined;
			const settle = (err?: Error) => {
				if (settled) return;
				settled = true;
				if (timeoutHandle) clearTimeout(timeoutHandle);
				if (err) reject(err);
				else resolve();
			};
			this.inflight.set(messageId, { settle });

			if (confirmTimeoutMs > 0) {
				timeoutHandle = setTimeout(() => {
					if (!this.inflight.has(messageId)) return;
					this.inflight.delete(messageId);
					settle(new ConfirmTimeoutError(routingKey, confirmTimeoutMs));
				}, confirmTimeoutMs);
			}

			try {
				ch.publish(
					exchange,
					routingKey,
					payload,
					{
						persistent: true,
						mandatory: true,
						contentType: "application/json",
						messageId,
						headers: {
							[X_EVENT_NAME]: eventName,
							[X_EVENT_VERSION]: eventVersion,
						},
					},
					(err) => {
						if (!this.inflight.has(messageId)) return;
						this.inflight.delete(messageId);
						if (err) settle(err instanceof Error ? err : new Error(String(err)));
						else settle();
					},
				);
			} catch (err) {
				this.inflight.delete(messageId);
				settle(err instanceof Error ? err : new Error(String(err)));
			}
		});
	}

	private async publishWithRetry<TData>(
		exchange: string,
		routingKey: string,
		eventName: string,
		eventVersion: number,
		businessId: string,
		data: TData,
		confirmTimeoutMs: number,
	): Promise<void> {
		const envelope: Envelope<TData> = {
			eventName,
			eventVersion,
			occurredAt: new Date().toISOString(),
			traceparent: undefined,
			data,
		};

		const monitor = this.monitorFactory(
			{ processName: "amqp-publish", businessId, stageName: `publish:${eventName}` },
			{ eventVersion },
		);
		monitor.logStarted();

		const totalAttempts = RETRY_BACKOFFS_MS.length + 1;
		let lastError: Error | undefined;
		let retryPendingId: string | null = null;
		const clearRetryPending = (): void => {
			if (retryPendingId) {
				this.inflight.delete(retryPendingId);
				retryPendingId = null;
			}
		};
		try {
			for (let attempt = 1; attempt <= totalAttempts; attempt++) {
				clearRetryPending();
				try {
					await this.publishOnce(
						exchange,
						routingKey,
						eventName,
						eventVersion,
						envelope,
						confirmTimeoutMs,
					);
					monitor.logSuccess();
					return;
				} catch (err) {
					lastError = err instanceof Error ? err : new Error(String(err));
					const isLast = attempt === totalAttempts;
					if (isLast) {
						const exhausted = new PublishExhaustedError(eventName, attempt, lastError);
						monitor.logAborting(exhausted);
						throw exhausted;
					}
					monitor.logRetry(lastError);
					// Keep drain() blocking across retry sleep so shutdown waits for the next attempt.
					retryPendingId = `retry-pending-${randomUUID()}`;
					this.inflight.set(retryPendingId, { settle: () => {} });
					await sleep(RETRY_BACKOFFS_MS[attempt - 1]);
				}
			}
		} finally {
			clearRetryPending();
		}

		throw new PublishExhaustedError(eventName, totalAttempts, lastError ?? new Error("unknown"));
	}

	private async publishSwallowed<TData>(
		eventName: string,
		eventVersion: number,
		businessId: string,
		data: TData,
	): Promise<void> {
		try {
			await this.publishWithRetry(
				EXCHANGE_NAME,
				eventName,
				eventName,
				eventVersion,
				businessId,
				data,
				this.eventConfirmTimeoutMs,
			);
		} catch (err) {
			if (err instanceof PublishExhaustedError) return;
			throw err;
		}
	}

	async publishCommand<TData>(
		commandName: string,
		commandVersion: number,
		businessId: string,
		data: TData,
	): Promise<void> {
		await this.publishWithRetry(
			COMMANDS_EXCHANGE,
			commandName,
			commandName,
			commandVersion,
			businessId,
			data,
			this.commandConfirmTimeoutMs,
		);
	}

	async publishExportStarted(data: ExportStartedData): Promise<void> {
		await this.publishSwallowed(EXPORT_STARTED, EXPORT_STARTED_V1, data.jobId, data);
	}

	async publishExportCompleted(data: ExportCompletedData): Promise<void> {
		await this.publishSwallowed(EXPORT_COMPLETED, EXPORT_COMPLETED_V1, data.jobId, data);
	}

	async publishExportFailed(data: ExportFailedData): Promise<void> {
		await this.publishSwallowed(EXPORT_FAILED, EXPORT_FAILED_V1, data.jobId, data);
	}
}
