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
import type { ChannelModel, ConfirmChannel } from "amqplib";
import { connect } from "amqplib";
import type { MonitorFactory } from "./MonitorFactory.ts";

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

class PublishExhaustedError extends Error {
	readonly attempts: number;
	readonly cause: Error;
	constructor(eventName: string, attempts: number, cause: Error) {
		super(`Failed to publish '${eventName}' after ${attempts} attempts: ${cause.message}`);
		this.name = "PublishExhaustedError";
		this.attempts = attempts;
		this.cause = cause;
	}
}

interface Inflight {
	settle: (err?: Error) => void;
}

const RETRY_BACKOFFS_MS = [100, 500, 2000];
const RECONNECT_BACKOFFS_MS = [1_000, 2_000, 5_000, 10_000];
const RECONNECT_BACKOFF_CAP_MS = 30_000;

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

export class RabbitMQPublisher implements ExportEventPublisherPort {
	private readonly url: string;
	private readonly monitorFactory: MonitorFactory;
	private connection: ChannelModel | null = null;
	private channel: ConfirmChannel | null = null;
	private inflight: Map<string, Inflight> = new Map();
	private reconnecting = false;
	private closed = false;
	private connecting: Promise<ConfirmChannel> | null = null;

	constructor(url: string, monitorFactory: MonitorFactory) {
		this.url = url;
		this.monitorFactory = monitorFactory;
	}

	async connect(): Promise<void> {
		await this.ensureChannel();
	}

	async close(): Promise<void> {
		this.closed = true;
		const ch = this.channel;
		const conn = this.connection;
		this.channel = null;
		this.connection = null;
		try {
			await ch?.close();
		} catch {}
		try {
			await conn?.close();
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

	private async ensureChannel(): Promise<ConfirmChannel> {
		if (this.closed) throw new Error("RabbitMQPublisher is closed");
		if (this.channel) return this.channel;
		if (this.connecting) {
			await this.connecting;
			if (!this.channel) throw new Error("RabbitMQPublisher channel not available after connect");
			return this.channel;
		}
		this.connecting = (async () => {
			const conn = await connect(this.url);
			const onConnectionLost = () => {
				if (this.connection !== conn) return;
				this.connection = null;
				this.channel = null;
				if (!this.closed) {
					void this.startReconnectLoop();
				}
			};
			conn.on("error", onConnectionLost);
			conn.on("close", onConnectionLost);
			const ch = await conn.createConfirmChannel();
			ch.on("error", () => {
				if (this.channel === ch) this.channel = null;
			});
			ch.on("close", () => {
				if (this.channel === ch) this.channel = null;
			});
			ch.on("return", (msg) => {
				const id = msg.properties.messageId as string | undefined;
				if (!id) return;
				const entry = this.inflight.get(id);
				if (!entry) return;
				this.inflight.delete(id);
				const routingKey = msg.fields.routingKey;
				entry.settle(new UnroutedError(routingKey));
			});
			await ch.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
			this.connection = conn;
			this.channel = ch;
			return ch;
		})();
		try {
			return await this.connecting;
		} finally {
			this.connecting = null;
		}
	}

	private async startReconnectLoop(): Promise<void> {
		if (this.reconnecting || this.closed) return;
		this.reconnecting = true;
		const monitor = this.monitorFactory({
			processName: "amqp-publish",
			businessId: "connection",
			stageName: "reconnect",
		});
		monitor.logStarted();
		let attempt = 0;
		while (!this.closed) {
			try {
				await this.ensureChannel();
				monitor.logSuccess();
				this.reconnecting = false;
				return;
			} catch (err) {
				const e = err instanceof Error ? err : new Error(String(err));
				monitor.logRetry(e);
				const delay = Math.min(
					RECONNECT_BACKOFFS_MS[Math.min(attempt, RECONNECT_BACKOFFS_MS.length - 1)],
					RECONNECT_BACKOFF_CAP_MS,
				);
				attempt++;
				await sleep(delay);
			}
		}
		this.reconnecting = false;
	}

	private async publishOnce<TData>(
		eventName: string,
		eventVersion: number,
		envelope: Envelope<TData>,
	): Promise<void> {
		const ch = await this.ensureChannel();
		const messageId = randomUUID();
		const payload = Buffer.from(JSON.stringify(envelope));

		return new Promise<void>((resolve, reject) => {
			let settled = false;
			const settle = (err?: Error) => {
				if (settled) return;
				settled = true;
				if (err) reject(err);
				else resolve();
			};
			this.inflight.set(messageId, { settle });

			try {
				ch.publish(
					EXCHANGE_NAME,
					eventName,
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
		eventName: string,
		eventVersion: number,
		businessId: string,
		data: TData,
	): Promise<void> {
		const envelope: Envelope<TData> = {
			eventName,
			eventVersion,
			occurredAt: new Date().toISOString(),
			traceparent: undefined,
			data,
		};

		const monitor = this.monitorFactory(
			{ processName: "amqp-publish", businessId, stageName: eventName },
			{ eventVersion },
		);
		monitor.logStarted();

		let lastError: Error | undefined;
		let retryPendingId: string | null = null;
		const clearRetryPending = (): void => {
			if (retryPendingId) {
				this.inflight.delete(retryPendingId);
				retryPendingId = null;
			}
		};
		try {
			for (let attempt = 1; attempt <= RETRY_BACKOFFS_MS.length; attempt++) {
				clearRetryPending();
				try {
					await this.publishOnce(eventName, eventVersion, envelope);
					monitor.logSuccess();
					return;
				} catch (err) {
					lastError = err instanceof Error ? err : new Error(String(err));
					// Reset connection + channel on transient errors so next attempt is fresh.
					if (!(lastError instanceof UnroutedError)) {
						const ch = this.channel;
						const conn = this.connection;
						this.channel = null;
						this.connection = null;
						try {
							await ch?.close();
						} catch {}
						try {
							await conn?.close();
						} catch {}
					}
					const isLast = attempt === RETRY_BACKOFFS_MS.length;
					if (isLast) {
						const exhausted = new PublishExhaustedError(eventName, attempt, lastError);
						monitor.logAborting(exhausted);
						throw exhausted;
					}
					monitor.logRetry(lastError);
					retryPendingId = `retry-pending-${randomUUID()}`;
					this.inflight.set(retryPendingId, { settle: () => {} });
					await sleep(RETRY_BACKOFFS_MS[attempt - 1]);
				}
			}
		} finally {
			clearRetryPending();
		}

		// Unreachable — loop always returns or throws.
		throw new PublishExhaustedError(
			eventName,
			RETRY_BACKOFFS_MS.length,
			lastError ?? new Error("unknown"),
		);
	}

	private async publishSwallowed<TData>(
		eventName: string,
		eventVersion: number,
		businessId: string,
		data: TData,
	): Promise<void> {
		try {
			await this.publishWithRetry(eventName, eventVersion, businessId, data);
		} catch (err) {
			if (err instanceof PublishExhaustedError) return;
			throw err;
		}
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
