import type { RedisClient } from "../../../../../bootstrap/container.ts";
import type {
	RenderJobState,
	RenderJobStatePort,
} from "../../../application/ports/outbound/RenderJobStatePort.ts";

const jobKey = (jobId: string): string => `video-editor:render:state:${jobId}`;
const JOB_TTL = 3600;

export class RedisRenderJobStateAdapter implements RenderJobStatePort {
	private readonly redis: RedisClient;

	constructor(redis: RedisClient) {
		this.redis = redis;
	}

	async saveState(jobId: string, state: RenderJobState): Promise<void> {
		await this.redis.set(jobKey(jobId), JSON.stringify(state), { EX: JOB_TTL });
	}

	async getState(jobId: string): Promise<RenderJobState | null> {
		const raw = await this.redis.get(jobKey(jobId));
		if (!raw) return null;
		return JSON.parse(raw) as RenderJobState;
	}
}
