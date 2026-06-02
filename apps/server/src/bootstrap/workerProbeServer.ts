import { createFastifyInstance, type TypedFastify } from "../infrastructure/fastify/fastify.ts";

export interface WorkerProbeDeps {
	port: number;
	host?: string;
	isReady: () => boolean;
	isAlive: () => boolean;
	getMetrics: () => { messagesInFlight: number };
}

export class WorkerProbeServer {
	private readonly app: TypedFastify;
	private readonly deps: WorkerProbeDeps;

	constructor(deps: WorkerProbeDeps) {
		this.app = createFastifyInstance();
		this.deps = deps;
		// Register routes in the constructor — registering in start() would throw
		// FST_ERR_DUPLICATED_ROUTE on a hypothetical restart.
		this.app.get("/health", async (_req, reply) => {
			if (this.deps.isAlive()) return reply.send({ status: "ok" });
			return reply.status(503).send({ status: "fatal" });
		});
		this.app.get("/ready", async (_req, reply) => {
			if (this.deps.isReady()) return reply.send({ status: "ready" });
			return reply.status(503).send({ status: "not-ready" });
		});
		this.app.get("/metrics", async (_req, reply) => {
			const { messagesInFlight } = this.deps.getMetrics();
			reply.header("content-type", "text/plain; version=0.0.4");
			return reply.send(
				`# HELP messages_in_flight Render messages currently being processed\n` +
					`# TYPE messages_in_flight gauge\n` +
					`messages_in_flight ${messagesInFlight}\n`,
			);
		});
	}

	async start(): Promise<void> {
		await this.app.listen({ port: this.deps.port, host: this.deps.host ?? "0.0.0.0" });
	}

	async stop(): Promise<void> {
		await this.app.close();
	}
}
