const coreBase = import.meta.env.VITE_BASE_URL + import.meta.env.VITE_CORE_EXTENSION;

export function fetchCore(path: string, init?: RequestInit): Promise<Response> {
	return fetch(`${coreBase}${path}`, { ...init, credentials: "include" });
}
