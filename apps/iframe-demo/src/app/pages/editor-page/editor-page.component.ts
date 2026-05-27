import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	type ElementRef,
	inject,
	NgZone,
	type OnDestroy,
	type OnInit,
	type Signal,
	signal,
	viewChild,
} from "@angular/core";
import { takeUntilDestroyed, toObservable } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { DomSanitizer, type SafeResourceUrl } from "@angular/platform-browser";
import { ActivatedRoute } from "@angular/router";
import { filter } from "rxjs";
import { environment } from "../../../environments/environment";
import {
	EDITOR_ADD_PREVIEW_ITEM,
	EDITOR_CLEAR_PROJECT,
	EDITOR_READY,
	EDITOR_SET_AUTH,
	type EditorResponse,
	type PreviewItemPayload,
	type RecordingRangePayload,
} from "../../message-types";
import { EditorBridgeService } from "../../services/editor-bridge.service";

const MIN_W = 320;
const MIN_H = 200;
const PANEL_W = 380;
const HANDLE = 8;

type Box = { x: number; y: number; w: number; h: number };
type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const DEMO_CHANNEL_ID = "demo-recording";
const DEMO_SEGMENT_START = 1778412270000;

@Component({
	selector: "app-editor-page",
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [FormsModule],
	templateUrl: "./editor-page.component.html",
	styleUrl: "./editor-page.component.scss",
})
export class EditorPageComponent implements OnInit, OnDestroy {
	readonly iframeRef = viewChild.required<ElementRef<HTMLIFrameElement>>("iframeEl");

	readonly editorReady = signal(false);
	readonly box = signal<Box>(this.initialBox());

	private readonly route = inject(ActivatedRoute);
	readonly channelId = signal(DEMO_CHANNEL_ID);
	readonly startTimeMs = signal(DEMO_SEGMENT_START);
	readonly endTimeMs = signal(DEMO_SEGMENT_START + 30000);
	readonly name = signal("");
	readonly lastResponse = signal<EditorResponse | null>(null);
	readonly outgoingPayload = signal<object | null>(null);

	readonly editorUrl: Signal<SafeResourceUrl>;
	readonly editorOrigin = new URL(environment.editorUrl).origin;

	private drag: { startX: number; startY: number; origBox: Box } | null = null;
	private resize: {
		dir: ResizeDir;
		startX: number;
		startY: number;
		origBox: Box;
	} | null = null;
	private readonly boundOnMove = this.onMouseMove.bind(this);
	private readonly boundOnUp = this.onMouseUp.bind(this);
	private readonly boundOnMessage = this.onMessage.bind(this);

	private readonly bridge = inject(EditorBridgeService);
	private readonly destroyRef = inject(DestroyRef);
	private readonly ngZone = inject(NgZone);

	get fullMode() {
		return this.bridge.fullMode;
	}

	constructor() {
		const sanitizer = inject(DomSanitizer);
		this.editorUrl = computed(() => {
			const url = `${environment.editorUrl}?fullScreen=${this.bridge.fullMode()}`;
			return sanitizer.bypassSecurityTrustResourceUrl(url);
		});
		toObservable(this.bridge.pendingItems)
			.pipe(
				filter((items) => items.length > 0 && this.editorReady()),
				takeUntilDestroyed(this.destroyRef),
			)
			.subscribe((items) => {
				this.bridge.drainQueue();
				for (const item of items) this.postItem(item);
			});
	}

	onIframeLoad(): void {
		this.editorReady.set(false);
	}

	ngOnInit(): void {
		const params = this.route.snapshot.queryParamMap;
		if (params.has("fullMode")) {
			this.bridge.fullMode.set(params.get("fullMode") !== "false");
		}

		this.ngZone.runOutsideAngular(() => {
			window.addEventListener("mousemove", this.boundOnMove);
			window.addEventListener("mouseup", this.boundOnUp);
			window.addEventListener("message", this.boundOnMessage);
		});
	}

	ngOnDestroy(): void {
		window.removeEventListener("mousemove", this.boundOnMove);
		window.removeEventListener("mouseup", this.boundOnUp);
		window.removeEventListener("message", this.boundOnMessage);
	}

	startDrag(e: MouseEvent): void {
		e.preventDefault();
		this.iframeRef().nativeElement.style.pointerEvents = "none";
		document.body.style.userSelect = "none";
		document.body.style.cursor = "grabbing";
		this.drag = {
			startX: e.clientX,
			startY: e.clientY,
			origBox: { ...this.box() },
		};
	}

	startResize(dir: ResizeDir, e: MouseEvent): void {
		e.preventDefault();
		e.stopPropagation();
		this.iframeRef().nativeElement.style.pointerEvents = "none";
		document.body.style.userSelect = "none";
		document.body.style.cursor = `${dir}-resize`;
		this.resize = {
			dir,
			startX: e.clientX,
			startY: e.clientY,
			origBox: { ...this.box() },
		};
	}

	addRecordingRange(): void {
		const payload: RecordingRangePayload = {
			kind: "recording-range",
			channelId: this.channelId(),
			startTimeMs: this.startTimeMs(),
			endTimeMs: this.endTimeMs(),
			durationMs: Math.max(this.endTimeMs() - this.startTimeMs(), 1),
			...(this.name() ? { name: this.name() } : {}),
		};
		const msg = {
			type: EDITOR_ADD_PREVIEW_ITEM,
			requestId: crypto.randomUUID(),
			payload,
		};
		this.outgoingPayload.set(msg);
		this.postToEditor(msg);
	}

	clearProject(): void {
		const msg = { type: EDITOR_CLEAR_PROJECT, requestId: crypto.randomUUID() };
		this.outgoingPayload.set(msg);
		this.postToEditor(msg);
	}

	readonly HANDLE = HANDLE;
	readonly PANEL_W = PANEL_W;
	readonly corners: ResizeDir[] = ["nw", "ne", "sw", "se"];
	readonly edges: ResizeDir[] = ["n", "s", "w", "e"];

	cornerStyle(dir: ResizeDir): Record<string, string> {
		return {
			position: "absolute",
			width: `${HANDLE * 2}px`,
			height: `${HANDLE * 2}px`,
			...(dir.includes("n") ? { top: "0" } : { bottom: "0" }),
			...(dir.includes("w") ? { left: "0" } : { right: "0" }),
			cursor: `${dir}-resize`,
			zIndex: "10",
		};
	}

	edgeStyle(dir: ResizeDir): Record<string, string> {
		const h2 = `${HANDLE * 2}px`;
		const h = `${HANDLE}px`;
		if (dir === "n")
			return {
				position: "absolute",
				top: "0",
				left: h2,
				right: h2,
				height: h,
				cursor: "n-resize",
				zIndex: "9",
			};
		if (dir === "s")
			return {
				position: "absolute",
				bottom: "0",
				left: h2,
				right: h2,
				height: h,
				cursor: "s-resize",
				zIndex: "9",
			};
		if (dir === "w")
			return {
				position: "absolute",
				left: "0",
				top: h2,
				bottom: h2,
				width: h,
				cursor: "w-resize",
				zIndex: "9",
			};
		return {
			position: "absolute",
			right: "0",
			top: h2,
			bottom: h2,
			width: h,
			cursor: "e-resize",
			zIndex: "9",
		};
	}

	stringify(v: unknown): string {
		return JSON.stringify(v, null, 2);
	}

	private postItem(item: PreviewItemPayload): void {
		const msg = {
			type: EDITOR_ADD_PREVIEW_ITEM,
			requestId: crypto.randomUUID(),
			payload: item,
		};
		this.outgoingPayload.set(msg);
		this.postToEditor(msg);
	}

	private getZtubeToken(): string {
		const match = document.cookie.match(/(?:^|;\s*)ztube-token=([^;]+)/);
		return match ? decodeURIComponent(match[1]) : "";
	}

	private postToEditor(payload: object): void {
		this.iframeRef().nativeElement.contentWindow?.postMessage(payload, this.editorOrigin);
	}

	private onMessage(event: MessageEvent): void {
		if (event.origin !== this.editorOrigin) return;
		let data: EditorResponse;
		try {
			data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
		} catch {
			return;
		}
		if (!String(data?.type ?? "").startsWith("EDITOR_")) return;

		if (data.type === EDITOR_READY) {
			this.editorReady.set(true);
			const token = this.getZtubeToken();
			if (token) this.postToEditor({ type: EDITOR_SET_AUTH, token });
			const pending = this.bridge.drainQueue();
			for (const item of pending) this.postItem(item);
			return;
		}

		this.bridge.setLastResponse(data);
		this.lastResponse.set(data);
	}

	private onMouseMove(e: MouseEvent): void {
		if (this.drag) {
			const dx = e.clientX - this.drag.startX;
			const dy = e.clientY - this.drag.startY;
			const { x, y, w, h } = this.drag.origBox;
			this.box.set(this.clamp({ x: x + dx, y: y + dy, w, h }));
			return;
		}
		if (this.resize) {
			const dx = e.clientX - this.resize.startX;
			const dy = e.clientY - this.resize.startY;
			const { x, y, w, h } = this.resize.origBox;
			const dir = this.resize.dir;
			let nx = x;
			let ny = y;
			let nw = w;
			let nh = h;
			if (dir.includes("e")) nw = w + dx;
			if (dir.includes("s")) nh = h + dy;
			if (dir.includes("w")) {
				nw = w - dx;
				nx = x + dx;
			}
			if (dir.includes("n")) {
				nh = h - dy;
				ny = y + dy;
			}
			this.box.set(this.clamp({ x: nx, y: ny, w: nw, h: nh }));
		}
	}

	private onMouseUp(): void {
		this.drag = null;
		this.resize = null;
		document.body.style.cursor = "";
		document.body.style.userSelect = "";
		this.iframeRef().nativeElement.style.pointerEvents = "auto";
	}

	private clamp(b: Box): Box {
		const maxW = window.innerWidth - PANEL_W;
		const maxH = window.innerHeight;
		const w = Math.max(MIN_W, Math.min(b.w, maxW));
		const h = Math.max(MIN_H, Math.min(b.h, maxH));
		const x = Math.max(0, Math.min(b.x, maxW - w));
		const y = Math.max(0, Math.min(b.y, maxH - h));
		return { x, y, w, h };
	}

	private initialBox(): Box {
		const maxW = window.innerWidth - PANEL_W;
		return {
			x: 40,
			y: 40,
			w: Math.max(MIN_W, Math.min(900, maxW - 80)),
			h: Math.max(MIN_H, window.innerHeight - 80),
		};
	}
}
