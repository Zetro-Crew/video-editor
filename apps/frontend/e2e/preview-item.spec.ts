import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Frame, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// Origins
// The editor is served by Vite at EDITOR_ORIGIN.
// Same-origin tests use a parent page also served at EDITOR_ORIGIN
// (intercepted via page.route so no real listener is needed).
// Cross-origin tests use CROSS_ORIGIN – a different port – to cover the
// allowlist enforcement branch in use-editor-post-message.ts (line 446).
// ---------------------------------------------------------------------------
const EDITOR_ORIGIN = "http://127.0.0.1:3000";
const CROSS_ORIGIN = "http://127.0.0.1:9999";

const MOCK_PLAYLIST_URL = "https://s3.example.com/preview/mock-job/index.m3u8?sig=mock";

const MOCK_PREVIEW_RESPONSE = {
	type: "hls",
	playlistUrl: MOCK_PLAYLIST_URL,
	channelId: "20574",
	requestedStartMs: 1778412276333,
	requestedEndMs: 1778412813617,
	durationMs: 537284,
	sourceOffsetMs: 6333,
};

// Parent HTML always embeds the editor iframe from EDITOR_ORIGIN.
// Used both for same-origin parent (served from EDITOR_ORIGIN/e2e-parent)
// and cross-origin parent (served from CROSS_ORIGIN/e2e-parent).
const PARENT_HTML = `<!DOCTYPE html>
<html>
<body style="margin:0">
  <iframe
    id="editor-iframe"
    src="${EDITOR_ORIGIN}/edit/test-scene"
    style="width:1280px;height:800px;border:none;"
  ></iframe>
</body>
</html>`;

let crossOriginServer: ReturnType<typeof createServer> | undefined;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Waits for the editor iframe to navigate (handles the async iframe load that
 * races with page.goto resolution) then waits for the editor module to expose
 * __editorStateManager on its window — a DEV-only signal that the module ran.
 */
async function getEditorFrame(page: Page): Promise<Frame> {
	// Poll until the iframe has actually navigated to the editor URL.
	// page.frame() is synchronous and returns null if called before the iframe
	// navigates; expect.poll retries until it's truthy.
	await expect
		.poll(() => page.frames().some((f) => f.url().includes("/edit/")), {
			message: "Editor iframe did not navigate to /edit/ URL",
			timeout: 12_000,
		})
		.toBeTruthy();

	const frame = page.frames().find((f) => f.url().includes("/edit/"));
	if (!frame) throw new Error("Editor frame disappeared between poll and lookup");

	// Wait for the editor module-level code to run and expose the state manager.
	// This is a DEV-only signal (editor.tsx line 37); production builds skip it.
	await frame.waitForFunction(
		() => !!(window as unknown as { __editorStateManager?: unknown }).__editorStateManager,
		{ timeout: 15_000 },
	);
	return frame;
}

/**
 * Sends a postMessage from the parent page to the editor iframe and waits for
 * the matching response on the parent window.  Mirrors real production usage:
 * the parent posts to iframe.contentWindow and listens for the ACK.
 */
async function sendAndAwaitResponse(
	page: Page,
	message: object,
	expectedResponseType: string,
	timeoutMs = 10_000,
): Promise<{ type: string; requestId: string; [k: string]: unknown }> {
	return page.evaluate(
		({ msg, responseType, editorOrigin, timeout }) =>
			new Promise((resolve, reject) => {
				const timer = setTimeout(
					() => reject(new Error(`Timeout waiting for ${responseType}`)),
					timeout,
				);
				window.addEventListener("message", function handler(evt) {
					if (evt.origin !== editorOrigin) return;
					const data = typeof evt.data === "string" ? JSON.parse(evt.data) : evt.data;
					if (data?.type === responseType) {
						clearTimeout(timer);
						window.removeEventListener("message", handler);
						resolve(data);
					}
				});
				const iframe = document.getElementById("editor-iframe") as HTMLIFrameElement;
				iframe.contentWindow?.postMessage(msg, editorOrigin);
			}),
		{
			msg: message,
			responseType: expectedResponseType,
			editorOrigin: EDITOR_ORIGIN,
			timeout: timeoutMs,
		},
	);
}

/**
 * Returns all track items from the editor's Zustand state by reading
 * window.__editorStateManager from within the editor iframe frame context.
 */
async function getTrackItems(frame: Frame): Promise<
	Record<
		string,
		{
			details?: { src?: string };
			trim?: { from?: number; to?: number };
			metadata?: Record<string, unknown>;
		}
	>
> {
	return frame.evaluate(() => {
		const sm = (
			window as unknown as {
				__editorStateManager?: {
					getState(): { trackItemsMap?: Record<string, unknown> };
				};
			}
		).__editorStateManager;
		return (sm?.getState()?.trackItemsMap ?? {}) as Record<string, unknown>;
	}) as unknown as Promise<ReturnType<typeof getTrackItems>>;
}

// ---------------------------------------------------------------------------
// Test-level setup: intercept both the same-origin and cross-origin parent
// page paths so no real server is needed at those URLs.
// ---------------------------------------------------------------------------
test.beforeEach(async ({ page }) => {
	await page.route(`${EDITOR_ORIGIN}/e2e-parent`, async (route) => {
		await route.fulfill({ contentType: "text/html", body: PARENT_HTML });
	});
});

test.beforeAll(async () => {
	crossOriginServer = createServer((_req: IncomingMessage, res: ServerResponse) => {
		res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
		res.end(PARENT_HTML);
	});

	await new Promise<void>((resolve, reject) => {
		crossOriginServer?.once("error", reject);
		crossOriginServer?.listen(9999, "127.0.0.1", resolve);
	});

	const address = crossOriginServer.address() as AddressInfo | null;
	if (!address || address.port !== 9999) {
		throw new Error("Cross-origin test server failed to bind to 127.0.0.1:9999");
	}
});

test.afterAll(async () => {
	await new Promise<void>((resolve, reject) => {
		if (!crossOriginServer) {
			resolve();
			return;
		}
		crossOriginServer.close((error: unknown) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});
});

// ---------------------------------------------------------------------------
// recording-range WITH inline playback (no backend call needed)
// Parent is same-origin with the editor; tests correct item wiring.
// ---------------------------------------------------------------------------
test.describe("recording-range with inline playback", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(`${EDITOR_ORIGIN}/e2e-parent`, {
			waitUntil: "networkidle",
		});
		await getEditorFrame(page);
	});

	test("EDITOR_PREVIEW_ITEM_ADDED: item in state with correct src, trim, metadata", async ({
		page,
	}) => {
		const SOURCE_OFFSET_MS = 6333;
		const DURATION_MS = 537284;
		const START_TIME_MS = 1778412276333;
		const END_TIME_MS = 1778412813617;

		const response = await sendAndAwaitResponse(
			page,
			{
				type: "EDITOR_ADD_PREVIEW_ITEM",
				requestId: "rr-inline-1",
				payload: {
					kind: "recording-range",
					channelId: "20574",
					startTimeMs: START_TIME_MS,
					endTimeMs: END_TIME_MS,
					durationMs: DURATION_MS,
					playback: { kind: "hls", src: MOCK_PLAYLIST_URL },
					sourceOffsetMs: SOURCE_OFFSET_MS,
					posterSrc: "https://example.com/poster.jpg",
				},
			},
			"EDITOR_PREVIEW_ITEM_ADDED",
		);

		expect(response.type).toBe("EDITOR_PREVIEW_ITEM_ADDED");
		expect(response.requestId).toBe("rr-inline-1");

		const frame = await getEditorFrame(page);
		const items = await getTrackItems(frame);
		const values = Object.values(items);
		expect(values).toHaveLength(1);

		const item = values[0];
		expect(item.details?.src).toBe(MOCK_PLAYLIST_URL);
		expect(item.trim?.from).toBe(SOURCE_OFFSET_MS);
		expect(item.trim?.to).toBe(SOURCE_OFFSET_MS + DURATION_MS);
		expect(item.metadata?.sourceStartTimeMs).toBe(START_TIME_MS);
		expect(item.metadata?.sourceEndTimeMs).toBe(END_TIME_MS);
		expect(item.metadata?.previewUrl).toBe("https://example.com/poster.jpg");
		expect(item.metadata?.sourceOffsetMs).toBeUndefined();
		expect(item.metadata?.channelId).toBe("20574");
	});

	test("mp4 media kind: correct src, trim.from=0, trim.to=durationMs", async ({ page }) => {
		const DURATION_MS = 120000;
		const MP4_URL = "https://example.com/media/mock-video.mp4";

		await sendAndAwaitResponse(
			page,
			{
				type: "EDITOR_ADD_PREVIEW_ITEM",
				requestId: "media-mp4-1",
				payload: {
					kind: "media",
					mediaId: "media-1001",
					durationMs: DURATION_MS,
					playback: { kind: "mp4", src: MP4_URL },
					posterSrc: "https://example.com/media/poster.jpg",
				},
			},
			"EDITOR_PREVIEW_ITEM_ADDED",
		);

		const frame = await getEditorFrame(page);
		const items = await getTrackItems(frame);
		const values = Object.values(items);
		expect(values).toHaveLength(1);

		const item = values[0];
		expect(item.details?.src).toBe(MP4_URL);
		expect(item.trim?.from).toBe(0);
		expect(item.trim?.to).toBe(DURATION_MS);
		expect(item.metadata?.externalKind).toBe("media");
		expect(item.metadata?.previewUrl).toBe("https://example.com/media/poster.jpg");
	});

	test("EDITOR_PREVIEW_ITEM_REJECTED for invalid payload; state unchanged", async ({ page }) => {
		const response = await sendAndAwaitResponse(
			page,
			{
				type: "EDITOR_ADD_PREVIEW_ITEM",
				requestId: "bad-payload-1",
				payload: { kind: "recording-range" },
			},
			"EDITOR_PREVIEW_ITEM_REJECTED",
		);

		expect(response.type).toBe("EDITOR_PREVIEW_ITEM_REJECTED");
		expect(response.requestId).toBe("bad-payload-1");

		const frame = await getEditorFrame(page);
		expect(Object.keys(await getTrackItems(frame))).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// recording-range WITHOUT playback — resolved via POST /api/editor/preview-source
// ---------------------------------------------------------------------------
test.describe("recording-range resolved via backend", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/editor/preview-source", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(MOCK_PREVIEW_RESPONSE),
			});
		});
		await page.goto(`${EDITOR_ORIGIN}/e2e-parent`, {
			waitUntil: "networkidle",
		});
		await getEditorFrame(page);
	});

	test("calls backend; item has playlistUrl as src, trim uses backend sourceOffsetMs", async ({
		page,
	}) => {
		let backendCalled = false;
		await page.route("**/api/editor/preview-source", async (route) => {
			backendCalled = true;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(MOCK_PREVIEW_RESPONSE),
			});
		});

		await sendAndAwaitResponse(
			page,
			{
				type: "EDITOR_ADD_PREVIEW_ITEM",
				requestId: "rr-resolved-1",
				payload: {
					kind: "recording-range",
					channelId: "20574",
					startTimeMs: 1778412276333,
					endTimeMs: 1778412813617,
					durationMs: 537284,
				},
			},
			"EDITOR_PREVIEW_ITEM_ADDED",
		);

		expect(backendCalled).toBe(true);

		const frame = await getEditorFrame(page);
		const item = Object.values(await getTrackItems(frame))[0];
		expect(item.details?.src).toBe(MOCK_PLAYLIST_URL);
		expect(item.trim?.from).toBe(MOCK_PREVIEW_RESPONSE.sourceOffsetMs);
		expect(item.trim?.to).toBe(MOCK_PREVIEW_RESPONSE.sourceOffsetMs + 537284);
	});

	test("sends correct payload shape to backend", async ({ page }) => {
		let capturedBody: unknown = null;
		await page.route("**/api/editor/preview-source", async (route) => {
			capturedBody = route.request().postDataJSON();
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(MOCK_PREVIEW_RESPONSE),
			});
		});

		await sendAndAwaitResponse(
			page,
			{
				type: "EDITOR_ADD_PREVIEW_ITEM",
				requestId: "payload-check",
				payload: {
					kind: "recording-range",
					channelId: "ch-99",
					startTimeMs: 1000,
					endTimeMs: 5000,
					durationMs: 4000,
				},
			},
			"EDITOR_PREVIEW_ITEM_ADDED",
		);

		expect(capturedBody).toMatchObject({
			source: {
				type: "channel-range",
				channelId: "ch-99",
				startTimeMs: 1000,
				endTimeMs: 5000,
			},
		});
	});

	test("EDITOR_PREVIEW_ITEM_REJECTED when backend 503; state unchanged", async ({ page }) => {
		await page.route("**/api/editor/preview-source", async (route) => {
			await route.fulfill({
				status: 503,
				body: JSON.stringify({ error: "down" }),
			});
		});

		const response = await sendAndAwaitResponse(
			page,
			{
				type: "EDITOR_ADD_PREVIEW_ITEM",
				requestId: "backend-fail-1",
				payload: {
					kind: "recording-range",
					channelId: "20574",
					startTimeMs: 1778412276333,
					endTimeMs: 1778412813617,
					durationMs: 537284,
				},
			},
			"EDITOR_PREVIEW_ITEM_REJECTED",
		);

		expect(response.type).toBe("EDITOR_PREVIEW_ITEM_REJECTED");
		const frame = await getEditorFrame(page);
		expect(Object.keys(await getTrackItems(frame))).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Cross-origin allowlist enforcement
//
// The parent page is served from CROSS_ORIGIN (port 9999), which is a
// DIFFERENT origin than the editor (port 3000).  The editor's allowedOrigins
// set (use-editor-post-message.ts:402-408) contains only window.location.origin
// (port 3000) unless VITE_EDITOR_PARENT_ORIGINS explicitly adds port 9999.
//
// With no env var set, messages from port 9999 hit the `!allowedOrigins.has`
// guard (line 446) and are silently dropped — no response is sent back.
// This test catches regressions where that guard is removed or bypassed.
//
// Positive cross-origin (messages accepted from a configured external origin)
// requires VITE_EDITOR_PARENT_ORIGINS=http://127.0.0.1:9999 in the dev server
// and is verified separately via env-specific runs.
// ---------------------------------------------------------------------------
test.describe("cross-origin allowlist enforcement", () => {
	test("silently drops postMessage from unauthorized cross-origin parent; no response, no state change", async ({
		page,
	}) => {
		// Navigate the main Playwright page to the cross-origin parent.
		// The iframe inside still loads the editor from EDITOR_ORIGIN (port 3000).
		// From the editor's perspective, event.origin will be CROSS_ORIGIN (port 9999),
		// which is NOT in allowedOrigins → the handler returns immediately.
		await page.goto(`${CROSS_ORIGIN}/e2e-parent`, { waitUntil: "networkidle" });
		const frame = await getEditorFrame(page);

		const gotResponse = await page.evaluate(
			({ editorOrigin, timeout }) =>
				new Promise<boolean>((resolve) => {
					const timer = setTimeout(() => resolve(false), timeout);
					window.addEventListener("message", function handler(evt) {
						if (evt.origin !== editorOrigin) return;
						const data = typeof evt.data === "string" ? JSON.parse(evt.data) : evt.data;
						// Any EDITOR_ response means the allowlist guard was bypassed.
						if (String(data?.type ?? "").startsWith("EDITOR_")) {
							clearTimeout(timer);
							window.removeEventListener("message", handler);
							resolve(true);
						}
					});
					const iframe = document.getElementById("editor-iframe") as HTMLIFrameElement;
					iframe.contentWindow?.postMessage(
						{
							type: "EDITOR_ADD_PREVIEW_ITEM",
							requestId: "cross-origin-rejected",
							payload: {
								kind: "recording-range",
								channelId: "20574",
								startTimeMs: 1778412276333,
								endTimeMs: 1778412813617,
								durationMs: 537284,
								playback: {
									kind: "hls",
									src: "https://example.com/fake.m3u8",
								},
								sourceOffsetMs: 0,
							},
						},
						editorOrigin,
					);
				}),
			{ editorOrigin: EDITOR_ORIGIN, timeout: 3_000 },
		);

		// No response within 3 s → message was silently dropped by the allowlist guard.
		expect(gotResponse).toBe(false);

		// Confirm the editor state is untouched — no item was added.
		expect(Object.keys(await getTrackItems(frame))).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// EDITOR_CLEAR_PROJECT
// ---------------------------------------------------------------------------
test.describe("EDITOR_CLEAR_PROJECT", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/editor/preview-source", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(MOCK_PREVIEW_RESPONSE),
			});
		});
		await page.goto(`${EDITOR_ORIGIN}/e2e-parent`, {
			waitUntil: "networkidle",
		});
		await getEditorFrame(page);
	});

	test("removes all items from state after EDITOR_CLEAR_PROJECT", async ({ page }) => {
		await sendAndAwaitResponse(
			page,
			{
				type: "EDITOR_ADD_PREVIEW_ITEM",
				requestId: "setup-add",
				payload: {
					kind: "recording-range",
					channelId: "20574",
					startTimeMs: 1778412276333,
					endTimeMs: 1778412813617,
					durationMs: 537284,
					playback: { kind: "hls", src: MOCK_PLAYLIST_URL },
					sourceOffsetMs: 6333,
				},
			},
			"EDITOR_PREVIEW_ITEM_ADDED",
		);

		const frame = await getEditorFrame(page);
		expect(Object.keys(await getTrackItems(frame))).toHaveLength(1);

		const clearResponse = await sendAndAwaitResponse(
			page,
			{ type: "EDITOR_CLEAR_PROJECT", requestId: "clear-1" },
			"EDITOR_PROJECT_CLEARED",
		);

		expect(clearResponse.type).toBe("EDITOR_PROJECT_CLEARED");
		expect(clearResponse.requestId).toBe("clear-1");
		expect(Object.keys(await getTrackItems(frame))).toHaveLength(0);
	});

	test("duplicate requestId returns cached EDITOR_PROJECT_CLEARED", async ({ page }) => {
		const msg = { type: "EDITOR_CLEAR_PROJECT", requestId: "dedup-clear" };
		const first = await sendAndAwaitResponse(page, msg, "EDITOR_PROJECT_CLEARED");
		const second = await sendAndAwaitResponse(page, msg, "EDITOR_PROJECT_CLEARED");
		expect(first.type).toBe("EDITOR_PROJECT_CLEARED");
		expect(second.requestId).toBe(first.requestId);
	});
});
