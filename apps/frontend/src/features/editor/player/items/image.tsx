import { BoxAnim, ContentAnim, MaskAnim } from "@designcombo/animations";
import type { IImage } from "@designcombo/types";
import { Img, useCurrentFrame } from "remotion";
import { calculateFrames } from "../../utils/frames";
import { getAnimations } from "../../utils/get-animations";
import { BaseSequence, type SequenceItemOptions } from "../base-sequence";
import { calculateContainerStyles, calculateMediaStyles } from "../styles";

export default function Image({ item, options }: { item: IImage; options: SequenceItemOptions }) {
	const frame = useCurrentFrame();
	const { fps } = options;
	const { details, animations } = item;
	const { animationIn, animationOut, animationTimed } = getAnimations(
		animations!,
		item,
		frame,
		fps,
	);
	const crop = details?.crop || {
		x: 0,
		y: 0,
		width: details.width,
		height: details.height,
	};
	const { durationInFrames } = calculateFrames(item.display, fps);
	const currentFrame = (frame || 0) - (item.display.from * fps) / 1000;

	const children = (
		<BoxAnim
			style={calculateContainerStyles(details, crop, {
				transform: "scale(1)",
			})}
			animationIn={animationIn!}
			animationOut={animationOut!}
			frame={currentFrame}
			durationInFrames={durationInFrames}
		>
			<ContentAnim
				animationTimed={animationTimed!}
				durationInFrames={durationInFrames}
				frame={currentFrame}
			>
				<MaskAnim item={item} keyframeAnimations={animationTimed!} frame={frame || 0}>
					<div id={`${item.id}-reveal-mask`} style={calculateMediaStyles(details, crop)}>
						{/* image layer */}
						<Img data-id={item.id} src={details.src} />
					</div>
				</MaskAnim>
			</ContentAnim>
		</BoxAnim>
	);

	return BaseSequence({ item, options, children });
}
