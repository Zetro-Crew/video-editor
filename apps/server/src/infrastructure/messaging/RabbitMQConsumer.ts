import { Logger } from "@ztube/observability";
import type { Channel, ChannelModel, ConsumeMessage, RecoveringChannelModel } from "amqplib";
import { connect } from "amqplib";
import type { ConnectionSSLOptions } from "../../bootstrap/container.ts";

type ConsumerHandler = (msg: ConsumeMessage, channel: AckLike) => Promise<void>;

interface AckLike {
	ack(msg: ConsumeMessage): void;
	nack(msg: ConsumeMessage, allUpTo: boolean, requeue: boolean): void;
}

type TopologyAsserter = (ch: Channel) => Promise<void>;

export interface RabbitMQConsumerOptions {
	url: string;
	queue: string;
	prefetch: number;
	handler: ConsumerHandler;
	consumerName: string;
	// Idempotent topology assertion run on every (re)connect — guarantees the
	// queue exists before basic.consume and gives the consumer parity with the
	// publisher (no NOT_FOUND if the worker starts before the API has booted).
	assertTopology?: TopologyAsserter;
	initialConnectTimeoutMs?: number;
	recoveryMaxDelayMs?: number;
	socketOptions?: ConnectionSSLOptions;
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

const DEFAULT_INITIAL_CONNECT_TIMEOUT_MS = 15_000;
const RECOVERY_INITIAL_DELAY_MS = 1_000;
const RECOVERY_MAX_DELAY_MS = 30_000;
const RECOVERY_FACTOR = 2;
const RECOVERY_JITTER = 0.2;

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

export class RabbitMQConsumer {
	private readonly options: RabbitMQConsumerOptions;
	private readonly initialConnectTimeoutMs: number;
	private readonly recoveryMaxDelayMs: number;
	private model: RecoveringChannelModel | null = null;
	private channel: Channel | null = null;
	private consumerTag: string | null = null;
	private inflight = 0;
	private stopping = false;
	private closed = false;
	private reconnectCount = 0;

	constructor(options: RabbitMQConsumerOptions) {
		this.options = options;
		this.initialConnectTimeoutMs =
			options.initialConnectTimeoutMs ?? DEFAULT_INITIAL_CONNECT_TIMEOUT_MS;
		this.recoveryMaxDelayMs = options.recoveryMaxDelayMs ?? RECOVERY_MAX_DELAY_MS;
	}

	get inflightCount(): number {
		return this.inflight;
	}

	get isRegistered(): boolean {
		return this.consumerTag !== null;
	}

	async start(): Promise<void> {
		if (this.closed) throw new Error(`[consumer:${this.options.consumerName}] is closed`);
		if (this.model) return;
		const model = await this.openRecoveringWithTimeout();
		if (this.closed) {
			await model.close().catch(() => {});
			throw new Error(`[consumer:${this.options.consumerName}] is closed`);
		}
		this.model = model;
		this.attachModelListeners(model);
	}

	private async openRecoveringWithTimeout(): Promise<RecoveringChannelModel> {
		let timedOut = false;
		let timeoutHandle: NodeJS.Timeout | undefined;
		const connectPromise = connect(this.options.url, {
			...this.options.socketOptions,
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
					new Error(
						`[consumer:${this.options.consumerName}] initial connect timed out after ${this.initialConnectTimeoutMs}ms`,
					),
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

	private async runSetup(model: ChannelModel): Promise<void> {
		const ch = await model.createChannel();
		this.attachChannelListeners(ch);
		if (this.options.assertTopology) {
			await this.options.assertTopology(ch);
		}
		await ch.prefetch(this.options.prefetch);
		if (this.stopping || this.closed) {
			try {
				await ch.close();
			} catch {}
			return;
		}
		this.channel = ch;

		const { consumerTag } = await ch.consume(
			this.options.queue,
			(msg) => {
				if (!msg) {
					// Broker-initiated cancel (e.g. queue deleted). Clear our tag; recovery
					// wrapper won't re-trigger on this — log and rely on operator action.
					if (this.consumerTag) {
						Logger.logWarning(
							`[consumer:${this.options.consumerName}] basic.cancel received from broker`,
						);
						this.consumerTag = null;
					}
					return;
				}
				if (this.closed) return;
				this.inflight++;
				void this.runHandler(msg, ch).finally(() => {
					this.inflight--;
				});
			},
			{ noAck: false },
		);
		this.consumerTag = consumerTag;
		Logger.logInfo(`[consumer:${this.options.consumerName}] registered`, {
			queue: this.options.queue,
			consumerTag,
		});
	}

	private attachChannelListeners(ch: Channel): void {
		ch.on("error", (err) => {
			Logger.logError(
				`[consumer:${this.options.consumerName}] channel error`,
				err instanceof Error ? err : new Error(String(err)),
				formatAmqpError(err),
			);
		});
		ch.on("close", () => {
			if (this.channel === ch) {
				this.channel = null;
				this.consumerTag = null;
			}
		});
		ch.on("handler-error", (err, eventName) => {
			Logger.logError(
				`[consumer:${this.options.consumerName}] channel handler error`,
				err instanceof Error ? err : new Error(String(err)),
				{ handlerEvent: eventName },
			);
		});
	}

	private attachModelListeners(model: RecoveringChannelModel): void {
		// The first 'connect' is emitted before our await on openRecoveringWithTimeout
		// resolves, so every event we observe here is a recovery — not the initial connect.
		model.on("connect", () => {
			this.reconnectCount++;
			Logger.logInfo(`[consumer:${this.options.consumerName}] reconnected`, {
				reconnectCount: this.reconnectCount,
			});
		});
		model.on("disconnect", (err) => {
			Logger.logWarning(
				`[consumer:${this.options.consumerName}] disconnected`,
				formatAmqpError(err),
			);
			this.channel = null;
			this.consumerTag = null;
		});
		model.on("reconnect-scheduled", (info: { attempt: number; delay: number; error: Error }) => {
			if (info.attempt === 1 || info.attempt % 10 === 0) {
				Logger.logWarning(`[consumer:${this.options.consumerName}] reconnect-scheduled`, {
					attempt: info.attempt,
					delayMs: info.delay,
					...formatAmqpError(info.error),
				});
			}
		});
		model.on("reconnect-failed", (err) => {
			Logger.logError(
				`[consumer:${this.options.consumerName}] reconnect exhausted`,
				err instanceof Error ? err : new Error(String(err)),
			);
		});
		model.on("error", (err) => {
			Logger.logError(
				`[consumer:${this.options.consumerName}] model error`,
				err instanceof Error ? err : new Error(String(err)),
				formatAmqpError(err),
			);
		});
		model.on("handler-error", (err, eventName) => {
			Logger.logError(
				`[consumer:${this.options.consumerName}] model handler error`,
				err instanceof Error ? err : new Error(String(err)),
				{ handlerEvent: eventName },
			);
		});
	}

	// `ch` is captured at delivery time. If the channel closes underneath us
	// (transient broker loss), the ack/nack call below will throw — we log and
	// move on; the recovery wrapper will re-register on the next setup and the
	// broker will redeliver the un-acked message.
	private async runHandler(msg: ConsumeMessage, ch: Channel): Promise<void> {
		try {
			await this.options.handler(msg, {
				ack: (m) => {
					try {
						ch.ack(m);
					} catch {}
				},
				nack: (m, allUpTo, requeue) => {
					try {
						ch.nack(m, allUpTo, requeue);
					} catch {}
				},
			});
		} catch (err) {
			Logger.logError(
				`[consumer:${this.options.consumerName}] handler threw — nack requeue`,
				err instanceof Error ? err : new Error(String(err)),
			);
			try {
				ch.nack(msg, false, true);
			} catch {}
		}
	}

	async cancel(): Promise<void> {
		this.stopping = true;
		const tag = this.consumerTag;
		const ch = this.channel;
		this.consumerTag = null;
		if (tag && ch) {
			try {
				await ch.cancel(tag);
			} catch (err) {
				Logger.logWarning(`[consumer:${this.options.consumerName}] cancel failed`, {
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}
	}

	async waitForInflight(timeoutMs: number): Promise<void> {
		const start = Date.now();
		while (this.inflight > 0) {
			if (Date.now() - start > timeoutMs) {
				Logger.logWarning(`[consumer:${this.options.consumerName}] inflight drain timed out`, {
					inflight: this.inflight,
				});
				return;
			}
			await sleep(25);
		}
	}

	async close(): Promise<void> {
		this.closed = true;
		this.stopping = true;
		const model = this.model;
		this.channel = null;
		this.consumerTag = null;
		this.model = null;
		try {
			await model?.close();
		} catch {}
	}
}
