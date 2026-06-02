const serverExtension = import.meta.env.VITE_SERVER_EXTENSION ?? "";

export function serverUrl(path: string): string {
	return `${serverExtension}${path}`;
}

export function fetchServer(path: string, init?: RequestInit): Promise<Response> {
	return fetch(serverUrl(path), { credentials: "include", ...init });
}
