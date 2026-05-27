import type { EditorToParentMessage } from "@video-editor/iframe-contract";

const getAllowedOrigins = (): string[] => {
	const raw = import.meta.env.VITE_EDITOR_PARENT_ORIGINS as string | undefined;
	if (!raw) return [];
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
};

export function sendToParent(message: EditorToParentMessage): void {
	if (window.parent === window) return;
	const origins = getAllowedOrigins();
	const targetOrigin = origins[0] ?? "*";
	window.parent.postMessage(message, targetOrigin);
}
