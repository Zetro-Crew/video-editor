import { BoxAnim, ContentAnim, MaskAnim } from "@designcombo/animations";
import type { IIllustration } from "@designcombo/types";
import { useCurrentFrame } from "remotion";
import { calculateFrames } from "../../utils/frames";
import { getAnimations } from "../../utils/get-animations";
import { BaseSequence, type SequenceItemOptions } from "../base-sequence";
import { calculateContainerStyles } from "../styles";

const Illustration = ({ item, options }: { item: IIllustration; options: SequenceItemOptions }) => {
	const frame = useCurrentFrame();
	const { fps } = options;
	const { details, animations } = item;
	const { animationIn, animationOut, animationTimed } = getAnimations(
		animations!,
		item,
		frame,
		fps,
	);
	const { durationInFrames } = calculateFrames(item.display, fps);
	const currentFrame = (frame || 0) - (item.display.from * fps) / 1000;
	const children = (
		<BoxAnim
			style={calculateContainerStyles(details)}
			animationIn={animationIn!}
			animationOut={animationOut!}
			frame={currentFrame}
			durationInFrames={durationInFrames}
		>
			<ContentAnim
				animationTimed={animationTimed}
				durationInFrames={durationInFrames}
				frame={currentFrame}
				style={details as unknown as React.CSSProperties}
			>
				<MaskAnim item={item} keyframeAnimations={animationTimed} frame={frame || 0}>
					<div dangerouslySetInnerHTML={{ __html: item.details.svgString }} />
				</MaskAnim>
			</ContentAnim>
		</BoxAnim>
	);
	return BaseSequence({ item, options, children });
};
export default Illustration;
