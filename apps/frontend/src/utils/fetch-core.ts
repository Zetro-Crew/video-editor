// VITE_CORE_BASE_URL overrides the full base (local dev: http://localhost:8002/private).
// In production, leave it unset and use VITE_CORE_EXTENSION (e.g. ":8002/private") which
// is appended to window.location.origin so the request stays same-domain behind the gateway.
const coreBase =
	import.meta.env.VITE_CORE_BASE_URL ??
	`${window.location.origin}${import.meta.env.VITE_CORE_EXTENSION ?? ""}`;

export function fetchCore(path: string, init?: RequestInit): Promise<Response> {
	return fetch(`${coreBase}${path}`, {
		...init,
		credentials: "include",
	});
}
