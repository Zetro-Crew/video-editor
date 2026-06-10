const coreExtension = import.meta.env.VITE_CORE_EXTENSION ?? "";

export function fetchCore(path: string, init?: RequestInit): Promise<Response> {
	return fetch(`${coreExtension}${path}`, {
		...init,
		credentials: "include",
	});
}
