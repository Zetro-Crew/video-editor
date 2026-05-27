import type { RedisClient } from "../../../../../bootstrap/container.ts";
import type {
	EditVideoJobState,
	EditVideoJobStatePort,
} from "../../../application/ports/outbound/EditVideoJobStatePort.ts";

const jobKey = (jobId: string): string => `video-editor:edit-video:state:${jobId}`;
const JOB_TTL = 3600;

export class RedisEditVideoJobStateAdapter implements EditVideoJobStatePort {
	private readonly redis: RedisClient;

	constructor(redis: RedisClient) {
		this.redis = redis;
	}

	async saveState(jobId: string, state: EditVideoJobState): Promise<void> {
		await this.redis.set(jobKey(jobId), JSON.stringify(state), { EX: JOB_TTL });
	}

	async getState(jobId: string): Promise<EditVideoJobState | null> {
		const raw = await this.redis.get(jobKey(jobId));
		if (!raw) return null;
		return JSON.parse(raw) as EditVideoJobState;
	}
}
