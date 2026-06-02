import type { RenderRequestedData } from "../../../../../infrastructure/messaging/schemas/commands.ts";

export interface RenderCommandPort {
	enqueueRender(data: RenderRequestedData): Promise<void>;
}
