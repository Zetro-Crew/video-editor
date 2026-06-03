const JOB_ID_REGEX = /^[A-Za-z0-9_-]{1,128}$/;

class InvalidJobIdError extends Error {
	constructor(jobId: string) {
		super(`invalid jobId: ${JSON.stringify(jobId)}`);
		this.name = "InvalidJobIdError";
	}
}

function assertValidJobId(jobId: string): void {
	if (!JOB_ID_REGEX.test(jobId)) throw new InvalidJobIdError(jobId);
}

export function getRenderOutputKey(prefix: string, jobId: string, format: string): string {
	assertValidJobId(jobId);
	if (format === "dash") return `${prefix}/${jobId}`;
	return `${prefix}/${jobId}.${format}`;
}

// DASH writes a manifest at <outputKey>/manifest.mpd; non-DASH formats write
// the object at outputKey directly. The "is this job already done?" probe must
// HEAD the manifest for DASH, not the directory-style prefix key.
export function getRenderProbeKey(prefix: string, jobId: string, format: string): string {
	const outputKey = getRenderOutputKey(prefix, jobId, format);
	if (format === "dash") return `${outputKey}/manifest.mpd`;
	return outputKey;
}
