import type { Channel, ChannelModel } from "amqplib";
import { connect } from "amqplib";

export interface ExportEventPublisherPort {
	publishExportStarted(event: ExportStartedEvent): Promise<void>;
	publishExportCompleted(event: ExportCompletedEvent): Promise<void>;
	publishExportFailed(event: ExportFailedEvent): Promise<void>;
}

export interface ExportStartedEvent {
	jobId: string;
	mediaName: string;
	downloadToComputer: boolean;
	saveToPersonalChannel: boolean;
	selectedChannelIds: string[];
	exportType: "mp4" | "webp";
	items: unknown[];
}

export interface ExportCompletedEvent {
	jobId: string;
	url: string;
	exportType: "mp4" | "webp";
}

export interface ExportFailedEvent {
	jobId: string;
	error: string;
}

const EXCHANGE = "video-editor";

export class RabbitMQPublisher implements ExportEventPublisherPort {
	private readonly url: string;
	private connection: ChannelModel | null = null;
	private channel: Channel | null = null;

	constructor(url: string) {
		this.url = url;
	}

	async close(): Promise<void> {
		try {
			await this.channel?.close();
		} catch {}
		try {
			await this.connection?.close();
		} catch {}
		this.channel = null;
		this.connection = null;
	}

	private async ensureChannel(): Promise<Channel> {
		if (this.channel) return this.channel;
		this.connection = await connect(this.url);
		this.connection.on("error", () => {
			this.connection = null;
			this.channel = null;
		});
		this.connection.on("close", () => {
			this.connection = null;
			this.channel = null;
		});
		this.channel = await this.connection.createChannel();
		this.channel.on("error", () => {
			this.channel = null;
		});
		this.channel.on("close", () => {
			this.channel = null;
		});
		await this.channel.assertExchange(EXCHANGE, "topic", { durable: true });
		return this.channel;
	}

	private async publish(routingKey: string, event: unknown): Promise<void> {
		const payload = Buffer.from(JSON.stringify(event));
		try {
			const ch = await this.ensureChannel();
			ch.publish(EXCHANGE, routingKey, payload, {
				persistent: true,
				contentType: "application/json",
			});
		} catch {
			this.channel = null;
			this.connection = null;
			const ch = await this.ensureChannel();
			ch.publish(EXCHANGE, routingKey, payload, {
				persistent: true,
				contentType: "application/json",
			});
		}
	}

	async publishExportStarted(event: ExportStartedEvent): Promise<void> {
		await this.publish("export.started", event);
	}

	async publishExportCompleted(event: ExportCompletedEvent): Promise<void> {
		await this.publish("export.completed", event);
	}

	async publishExportFailed(event: ExportFailedEvent): Promise<void> {
		await this.publish("export.failed", event);
	}
}
