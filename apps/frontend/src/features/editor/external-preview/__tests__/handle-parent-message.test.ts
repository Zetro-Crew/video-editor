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
	addStoredMedia: ReturnType<typeof vi.fn>;
	clearProject: ReturnType<typeof vi.fn>;
	cache: Map<string, ResponseCacheEntry>;
}

const validRecordingPayload = {
	kind: "recording-range" as const,
	channelId: "ch-1",
	startTimeMs: 1000,
	endTimeMs: 4000,
	durationMs: 3000,
	playback: { kind: "hls" as const, src: "https://example.com/p.m3u8" },
};

const makeHarness = (overrides: Partial<ParentMessageDeps> = {}): Harness => {
	const posts: CapturedPost[] = [];
	const cache = new Map<string, ResponseCacheEntry>();
	const addPreviewItem = vi.fn(async () => "item-xyz");
	const addStoredMedia = vi.fn(async () => "stored-item-abc");
	const clearProject = vi.fn();
	const deps: ParentMessageDeps = {
		allowedOrigins: new Set(["https://parent.example"]),
		responseCache: cache,
		maxCacheSize: 100,
		addPreviewItem,
		addStoredMedia,
		clearProject,
		postResponse: (source, targetOrigin, message) => posts.push({ source, targetOrigin, message }),
		...overrides,
	};
	return { deps, posts, addPreviewItem, addStoredMedia, clearProject, cache };
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
		expect(harness.addStoredMedia).not.toHaveBeenCalled();
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

	it("invokes addPreviewItem and replies with EDITOR_PREVIEW_ITEM_ADDED on valid recording payload", async () => {
		await handleParentMessage(
			harness.deps,
			makeEvent({
				type: "EDITOR_ADD_PREVIEW_ITEM",
				requestId: "r2",
				payload: validRecordingPayload,
			}),
		);
		expect(harness.addPreviewItem).toHaveBeenCalledTimes(1);
		expect(harness.posts).toHaveLength(1);
		const msg = harness.posts[0].message as {
			type: string;
			requestId?: string;
			mediaId?: string;
			itemId: string;
		};
		expect(msg.type).toBe("EDITOR_PREVIEW_ITEM_ADDED");
		expect(msg.requestId).toBe("r2");
		expect(msg.itemId).toBe("item-xyz");
		expect(msg.mediaId).toBeUndefined();
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

	it("replays the cached response when requestId is already known (EDITOR_ADD_PREVIEW_ITEM)", async () => {
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
				payload: validRecordingPayload,
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
				payload: validRecordingPayload,
			}),
		);
		expect(harness.posts).toHaveLength(1);
		const msg = harness.posts[0].message as { type: string; reason: string; requestId?: string };
		expect(msg.type).toBe("EDITOR_PREVIEW_ITEM_REJECTED");
		expect(msg.reason).toBe("upstream blew up");
		expect(msg.requestId).toBe("r-fail");
	});

	describe("EDITOR_ADD_MEDIA", () => {
		it("invokes addStoredMedia and replies with EDITOR_PREVIEW_ITEM_ADDED echoing mediaId", async () => {
			await handleParentMessage(
				harness.deps,
				makeEvent({ type: "EDITOR_ADD_MEDIA", mediaId: "img-001" }),
			);
			expect(harness.addStoredMedia).toHaveBeenCalledTimes(1);
			expect(harness.addStoredMedia).toHaveBeenCalledWith("img-001");
			expect(harness.posts).toHaveLength(1);
			const msg = harness.posts[0].message as {
				type: string;
				mediaId?: string;
				itemId: string;
				requestId?: string;
			};
			expect(msg.type).toBe("EDITOR_PREVIEW_ITEM_ADDED");
			expect(msg.mediaId).toBe("img-001");
			expect(msg.itemId).toBe("stored-item-abc");
			expect(msg.requestId).toBeUndefined();
		});

		it("emits EDITOR_PREVIEW_ITEM_REJECTED with echoed mediaId + 'media not found' on StoredMediaNotFoundError-shape", async () => {
			harness.addStoredMedia.mockRejectedValueOnce(new Error("media not found"));
			await handleParentMessage(
				harness.deps,
				makeEvent({ type: "EDITOR_ADD_MEDIA", mediaId: "bogus" }),
			);
			expect(harness.posts).toHaveLength(1);
			const msg = harness.posts[0].message as {
				type: string;
				mediaId?: string;
				reason: string;
			};
			expect(msg.type).toBe("EDITOR_PREVIEW_ITEM_REJECTED");
			expect(msg.mediaId).toBe("bogus");
			expect(msg.reason).toBe("media not found");
		});

		it("emits EDITOR_PREVIEW_ITEM_REJECTED with 'core unavailable' on infra error", async () => {
			harness.addStoredMedia.mockRejectedValueOnce(new Error("core unavailable"));
			await handleParentMessage(
				harness.deps,
				makeEvent({ type: "EDITOR_ADD_MEDIA", mediaId: "x" }),
			);
			const msg = harness.posts[0].message as { reason: string; mediaId?: string };
			expect(msg.reason).toBe("core unavailable");
			expect(msg.mediaId).toBe("x");
		});

		it("dedupes by mediaId — second add replays cached response without re-fetching", async () => {
			await handleParentMessage(
				harness.deps,
				makeEvent({ type: "EDITOR_ADD_MEDIA", mediaId: "img-001" }),
			);
			await handleParentMessage(
				harness.deps,
				makeEvent({ type: "EDITOR_ADD_MEDIA", mediaId: "img-001" }),
			);
			expect(harness.addStoredMedia).toHaveBeenCalledTimes(1);
			expect(harness.posts).toHaveLength(2);
			expect(harness.posts[0].message).toEqual(harness.posts[1].message);
		});

		it("preserves rawMediaId correlation on Zod parse failure (mediaId: number)", async () => {
			await handleParentMessage(harness.deps, makeEvent({ type: "EDITOR_ADD_MEDIA", mediaId: 42 }));
			expect(harness.posts).toHaveLength(1);
			const msg = harness.posts[0].message as { type: string; mediaId?: string };
			expect(msg.type).toBe("EDITOR_PREVIEW_ITEM_REJECTED");
			expect(msg.mediaId).toBe("42");
		});
	});
});
