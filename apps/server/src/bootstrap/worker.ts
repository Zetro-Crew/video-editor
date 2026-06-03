import { Logger } from "@ztube/observability";
import type { WorkerEnvConfig } from "../config/env.ts";
import { RabbitMQConsumer } from "../infrastructure/messaging/RabbitMQConsumer.ts";
import {
	DLX_EXCHANGE,
	RENDER_DEAD_QUEUE,
	RENDER_REQUESTED,
	RENDER_REQUESTED_QUEUE,
} from "../infrastructure/messaging/schemas/commands.ts";
import { assertRenderTopology } from "../infrastructure/messaging/topology.ts";
import { buildWorkerContainer, type WorkerContainer } from "./container.ts";
import { WorkerProbeServer } from "./workerProbeServer.ts";

const INFLIGHT_DRAIN_BUDGET_MS = 540_000;

// Mirrors the publisher defaults in RabbitMQPublisher.ts. Both processes must
// assert the same args or RabbitMQ returns PRECONDITION_FAILED.
const RENDER_QUEUE_MAX_LENGTH = 10_000;
const RENDER_DELIVERY_LIMIT = 5;

export interface WorkerOptions {
	config: WorkerEnvConfig;
	container?: WorkerContainer;
	probe?: WorkerProbeServer;
}

export class Worker {
	private readonly config: WorkerEnvConfig;
	private readonly container: WorkerContainer;
	private readonly renderConsumer: RabbitMQConsumer;
	private readonly dlqConsumer: RabbitMQConsumer;
	private readonly probe: WorkerProbeServer;
	private started = false;
	private stopping = false;
	private fatal = false;

	constructor(options: WorkerOptions) {
		this.config = options.config;
		this.container = options.container ?? buildWorkerContainer(this.config);

		const topologyAsserter = (ch: Parameters<typeof assertRenderTopology>[0]) =>
			assertRenderTopology(ch, {
				renderRequestTtlMs: this.config.RENDER_REQUEST_TTL_MS,
				renderQueueMaxLength: RENDER_QUEUE_MAX_LENGTH,
				renderDeliveryLimit: RENDER_DELIVERY_LIMIT,
			});

		this.renderConsumer = new RabbitMQConsumer({
			url: this.config.RABBITMQ_URL,
			queue: RENDER_REQUESTED_QUEUE,
			prefetch: this.config.WORKER_CONCURRENCY,
			consumerName: "render.requested",
			initialConnectTimeoutMs: this.config.AMQP_INITIAL_CONNECT_TIMEOUT_MS,
			assertTopology: topologyAsserter,
			handler: (msg, ch) => this.container.renderRequestedConsumer.handle(msg, ch),
		});

		this.dlqConsumer = new RabbitMQConsumer({
			url: this.config.RABBITMQ_URL,
			queue: RENDER_DEAD_QUEUE,
			prefetch: 1,
			consumerName: "render.dead",
			initialConnectTimeoutMs: this.config.AMQP_INITIAL_CONNECT_TIMEOUT_MS,
			assertTopology: topologyAsserter,
			handler: (msg, ch) => this.container.renderDLQConsumer.handle(msg, ch),
		});

		this.probe =
			options.probe ??
			new WorkerProbeServer({
				port: this.config.WORKER_PROBE_PORT,
				isReady: () =>
					this.started && this.renderConsumer.isRegistered && this.dlqConsumer.isRegistered,
				// Liveness: only return 200 while the worker is running and we
				// haven't recorded a fatal startup failure. k8s should restart the
				// pod if we ever flip to fatal=true.
				isAlive: () => !this.fatal && !this.stopping,
				getMetrics: () => ({
					messagesInFlight: this.renderConsumer.inflightCount + this.dlqConsumer.inflightCount,
				}),
			});
	}

	async start(): Promise<void> {
		try {
			Logger.logInfo("[worker] connecting RabbitMQ publisher");
			await this.container.exportEventPublisher.connect();
			Logger.logInfo("[worker] starting render.requested consumer", {
				prefetch: this.config.WORKER_CONCURRENCY,
			});
			await this.renderConsumer.start();
			Logger.logInfo("[worker] starting render.dead DLQ consumer", {
				exchange: DLX_EXCHANGE,
				routingKey: RENDER_REQUESTED,
			});
			await this.dlqConsumer.start();
			await this.probe.start();
			this.started = true;
			Logger.logInfo("[worker] ready", { probePort: this.config.WORKER_PROBE_PORT });
		} catch (err) {
			this.fatal = true;
			throw err;
		}
	}

	async stop(): Promise<void> {
		if (this.stopping) return;
		this.stopping = true;
		Logger.logInfo("[worker] stop: cancelling consumers");
		try {
			await this.renderConsumer.cancel();
		} catch (err) {
			Logger.logError(
				"[worker] render consumer cancel failed",
				err instanceof Error ? err : new Error(String(err)),
			);
		}
		try {
			await this.dlqConsumer.cancel();
		} catch (err) {
			Logger.logError(
				"[worker] dlq consumer cancel failed",
				err instanceof Error ? err : new Error(String(err)),
			);
		}

		Logger.logInfo("[worker] waiting for in-flight messages", {
			inflight: this.renderConsumer.inflightCount + this.dlqConsumer.inflightCount,
			budgetMs: INFLIGHT_DRAIN_BUDGET_MS,
		});
		await Promise.all([
			this.renderConsumer.waitForInflight(INFLIGHT_DRAIN_BUDGET_MS),
			this.dlqConsumer.waitForInflight(INFLIGHT_DRAIN_BUDGET_MS),
		]);

		// Close consumer channels first so any acks/nacks issued during the drain
		// flush to the broker BEFORE the publisher closes. If we closed the
		// publisher first, in-flight handlers that publish export.completed
		// would fail mid-flight and the message would dead-letter.
		try {
			await this.renderConsumer.close();
		} catch {}
		try {
			await this.dlqConsumer.close();
		} catch {}

		try {
			await this.container.exportEventPublisher.drain(5_000);
		} catch (err) {
			Logger.logError(
				"[worker] publisher drain failed",
				err instanceof Error ? err : new Error(String(err)),
			);
		}
		try {
			await this.container.exportEventPublisher.close();
		} catch (err) {
			Logger.logError(
				"[worker] publisher close failed",
				err instanceof Error ? err : new Error(String(err)),
			);
		}
		try {
			await this.probe.stop();
		} catch (err) {
			Logger.logError(
				"[worker] probe stop failed",
				err instanceof Error ? err : new Error(String(err)),
			);
		}
		Logger.logInfo("[worker] stop complete");
	}
}
