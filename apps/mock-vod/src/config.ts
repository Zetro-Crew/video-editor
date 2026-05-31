export const RECORDING_ID = "demo-recording";

// Default static fixture window — wall-clock anchor matches reused demo segment binaries.
// Each segment 15s; two segments → 30s window starting at FIXTURE_WINDOW_START_MS.
export const FIXTURE_WINDOW_START_MS = 1_778_412_270_000;
export const FIXTURE_WINDOW_END_MS = FIXTURE_WINDOW_START_MS + 30_000;

export const DEFAULT_TOKEN_TTL_MS = 600_000;
export const DEFAULT_PORT = 5050;
export const DEFAULT_HOST = "127.0.0.1";
