import type { DesignPayload } from "@video-editor/contract/internal/render";
import type { RenderInputPort } from "../../../application/ports/inbound/RenderInputPort.ts";
import type { VideoRenderInput } from "../../../application/use-cases/VideoRenderUseCase.ts";
import { type IDesign, translate } from "../../../domain/DesignToRenderJobTranslator.ts";

export type { IDesign };

function toIDesign(payload: DesignPayload): IDesign {
	return {
		id: payload.id,
		size: payload.size,
		duration: payload.duration,
		fps: payload.fps,
		tracks: payload.tracks,
		trackItemIds: payload.trackItemIds,
		trackItemsMap: Object.fromEntries(
			Object.entries(payload.trackItemsMap).map(([k, v]) => [
				k,
				{
					id: v.id,
					type: v.type,
					display: v.display,
					trim: v.trim,
					duration: v.duration,
					metadata: v.metadata,
					details: v.details as Record<string, unknown> | undefined,
				},
			]),
		),
	};
}

export class DesignRenderInputAdapter implements RenderInputPort {
	private readonly design: IDesign;
	private readonly format: "mp4" | "webp" | "dash";
	private readonly frameTimeMs: number | undefined;

	constructor(
		payload: DesignPayload,
		format: "mp4" | "webp" | "dash" = "mp4",
		frameTimeMs?: number,
	) {
		this.design = toIDesign(payload);
		this.format = format;
		this.frameTimeMs = frameTimeMs;
	}

	build(): VideoRenderInput {
		return translate(this.design, this.format, this.frameTimeMs);
	}
}
