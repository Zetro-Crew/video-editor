import type { VideoRenderInput } from "../../use-cases/VideoRenderUseCase.ts";

export interface RenderInputPort {
	build(): VideoRenderInput;
}
