export interface RenderJobState {
	status: "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
	progress: number;
	url?: string;
	error?: string;
}

export interface RenderJobStatePort {
	saveState(jobId: string, state: RenderJobState): Promise<void>;
	getState(jobId: string): Promise<RenderJobState | null>;
}
