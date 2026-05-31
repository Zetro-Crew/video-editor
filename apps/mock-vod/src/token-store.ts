interface TokenRecord {
	recordingId: string;
	expiresAt: number;
}

export interface TokenStore {
	issue(input: { token: string; recordingId: string; ttlMs: number }): void;
	validate(token: string): string | null;
}

export function createTokenStore(): TokenStore {
	const store = new Map<string, TokenRecord>();
	return {
		issue({ token, recordingId, ttlMs }) {
			store.set(token, { recordingId, expiresAt: Date.now() + ttlMs });
		},
		validate(token) {
			const rec = store.get(token);
			if (!rec) return null;
			if (rec.expiresAt < Date.now()) {
				store.delete(token);
				return null;
			}
			return rec.recordingId;
		},
	};
}
