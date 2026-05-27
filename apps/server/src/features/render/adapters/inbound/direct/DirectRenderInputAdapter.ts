import type { RenderInputPort } from "../../../application/ports/inbound/RenderInputPort.ts";
import type { VideoRenderInput } from "../../../application/use-cases/VideoRenderUseCase.ts";

export class DirectRenderInputAdapter implements RenderInputPort {
	private readonly input: VideoRenderInput;

	constructor(input: VideoRenderInput) {
		this.input = input;
	}

	build(): VideoRenderInput {
		return this.input;
	}
}
