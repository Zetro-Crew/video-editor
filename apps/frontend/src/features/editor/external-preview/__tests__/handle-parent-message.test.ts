import type { EditorToParentMessage } from "@video-editor/contract/iframe/to-parent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	handleParentMessage,
	type ParentMessageDeps,
	type ResponseCacheEntry,
} from "../handle-parent-message";

interface CapturedPost {
	source: MessageEventSource | null;
	targetOrigin: string;
	message: EditorToParentMessage;
}

interface Harness {
	deps: ParentMessageDeps;
	posts: CapturedPost[];
	addPreviewItem: ReturnType<typeof vi.fn>;
	clearProject: ReturnType<typeof vi.fn>;
	cache: Map<string, ResponseCacheEntry>;
}

const makeHarness = (overrides: Partial<ParentMessageDeps> = {}): Harness => {
	const posts: CapturedPost[] = [];
	const cache = new Map<string, ResponseCacheEntry>();
	const addPreviewItem = vi.fn(async () => "item-xyz");
	const clearProject = vi.fn();
	const deps: ParentMessageDeps = {
		allowedOrigins: new Set(["https://parent.example"]),
		responseCache: cache,
		maxCacheSize: 100,
		addPreviewItem,
		clearProject,
		postResponse: (source, targetOrigin, message) => posts.push({ source, targetOrigin, message }),
		...overrides,
	};
	return { deps, posts, addPreviewItem, clearProject, cache };
};

const makeEvent = (data: unknown, origin = "https://parent.example") => ({
	origin,
	source: {} as MessageEventSource,
	data,
});

describe("handleParentMessage", () => {
	let harness: Harness;

	beforeEach(() => {
		harness = makeHarness();
	});

	it("ignores events from disallowed origins", async () => {
		await handleParentMessage(
			harness.deps,
			makeEvent({ type: "EDITOR_CLEAR_PROJECT" }, "https://evil.example"),
		);
		expect(harness.posts).toEqual([]);
		expect(harness.addPreviewItem).not.toHaveBeenCalled();
		expect(harness.clearProject).not.toHaveBeenCalled();
	});

	it("rejects with schema error for legacy EDITOR_SET_AUTH messages", async () => {
		await handleParentMessage(
			harness.deps,
			makeEvent({ type: "EDITOR_SET_AUTH", token: "x", requestId: "r1" }),
		);
		expect(harness.posts).toHaveLength(1);
		expect(harness.posts[0].message.type).toBe("EDITOR_PREVIEW_ITEM_REJECTED");
		const rejected = harness.posts[0].message as { requestId?: string; reason: string };
		expect(rejected.requestId).toBe("r1");
		expect(rejected.reason).toBeTruthy();
	});

	it("invokes addPreviewItem and replies with EDITOR_PREVIEW_ITEM_ADDED on valid payload", async () => {
		await handleParentMessage(
			harness.deps,
			makeEvent({
				type: "EDITOR_ADD_PREVIEW_ITEM",
				requestId: "r2",
				payload: {
					kind: "media",
					mediaId: "m-1",
					playback: { kind: "mp4", src: "https://example.com/v.mp4" },
				},
			}),
		);
		expect(harness.addPreviewItem).toHaveBeenCalledTimes(1);
		expect(harness.posts).toHaveLength(1);
		expect(harness.posts[0].message).toEqual({
			type: "EDITOR_PREVIEW_ITEM_ADDED",
			requestId: "r2",
			itemId: "item-xyz",
		});
	});

	it("invokes clearProject and replies with EDITOR_PROJECT_CLEARED on EDITOR_CLEAR_PROJECT", async () => {
		await handleParentMessage(
			harness.deps,
			makeEvent({ type: "EDITOR_CLEAR_PROJECT", requestId: "r3" }),
		);
		expect(harness.clearProject).toHaveBeenCalledTimes(1);
		expect(harness.posts).toHaveLength(1);
		expect(harness.posts[0].message).toEqual({
			type: "EDITOR_PROJECT_CLEARED",
			requestId: "r3",
		});
	});

	it("replays the cached response when requestId is already known", async () => {
		const cached: ResponseCacheEntry = {
			type: "EDITOR_PREVIEW_ITEM_ADDED",
			requestId: "dup",
			itemId: "prev-item",
		};
		harness.cache.set("dup", cached);

		await handleParentMessage(
			harness.deps,
			makeEvent({
				type: "EDITOR_ADD_PREVIEW_ITEM",
				requestId: "dup",
				payload: {
					kind: "media",
					mediaId: "m-1",
					playback: { kind: "mp4", src: "https://example.com/v.mp4" },
				},
			}),
		);

		expect(harness.addPreviewItem).not.toHaveBeenCalled();
		expect(harness.posts).toHaveLength(1);
		expect(harness.posts[0].message).toEqual(cached);
	});

	it("evicts oldest cache entry when at capacity", async () => {
		const tiny = makeHarness({ maxCacheSize: 2 });
		tiny.cache.set("a", { type: "EDITOR_PROJECT_CLEARED", requestId: "a" });
		tiny.cache.set("b", { type: "EDITOR_PROJECT_CLEARED", requestId: "b" });

		await handleParentMessage(
			tiny.deps,
			makeEvent({ type: "EDITOR_CLEAR_PROJECT", requestId: "c" }),
		);

		expect(tiny.cache.has("a")).toBe(false);
		expect(tiny.cache.has("b")).toBe(true);
		expect(tiny.cache.has("c")).toBe(true);
	});

	it("rejects with the thrown error message when addPreviewItem fails", async () => {
		harness.addPreviewItem.mockRejectedValueOnce(new Error("upstream blew up"));
		await handleParentMessage(
			harness.deps,
			makeEvent({
				type: "EDITOR_ADD_PREVIEW_ITEM",
				requestId: "r-fail",
				payload: {
					kind: "media",
					mediaId: "m-1",
					playback: { kind: "mp4", src: "https://example.com/v.mp4" },
				},
			}),
		);
		expect(harness.posts).toHaveLength(1);
		const msg = harness.posts[0].message as { type: string; reason: string; requestId?: string };
		expect(msg.type).toBe("EDITOR_PREVIEW_ITEM_REJECTED");
		expect(msg.reason).toBe("upstream blew up");
		expect(msg.requestId).toBe("r-fail");
	});
});
