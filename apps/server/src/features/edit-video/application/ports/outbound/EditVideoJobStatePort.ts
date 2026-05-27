import type { TimeRange } from "../../../../../shared/domain/TimeRange.ts";

export interface EditVideoJobState {
	status: "PROCESSING" | "COMPLETED" | "FAILED";
	progress: number;
	outputFile?: string;
	segments?: TimeRange[];
	error?: string;
}

export interface EditVideoJobStatePort {
	saveState(jobId: string, state: EditVideoJobState): Promise<void>;
	getState(jobId: string): Promise<EditVideoJobState | null>;
}
