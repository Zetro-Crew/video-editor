import { BoxAnim, ContentAnim, MaskAnim } from "@designcombo/animations";
import type { IShape } from "@designcombo/types";
import { useCurrentFrame } from "remotion";
import { calculateFrames } from "../../utils/frames";
import { getAnimations } from "../../utils/get-animations";
import { BaseSequence, type SequenceItemOptions } from "../base-sequence";
import { calculateContainerStyles } from "../styles";

const Shape = ({ item, options }: { item: IShape; options: SequenceItemOptions }) => {
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
	const d = details as any;
	const fillColor = d.backgroundColor || "transparent";
	const strokeColor = d.borderColor || "#000000";
	const strokeWidth: number | undefined = d.borderWidth;

	const rawSvg = details.src.startsWith("data:image/svg+xml;base64,")
		? atob(details.src.slice("data:image/svg+xml;base64,".length))
		: details.src;

	const styleRules = [
		`fill: ${fillColor};`,
		`stroke: ${strokeColor};`,
		strokeWidth !== undefined ? `stroke-width: ${strokeWidth};` : "",
	]
		.filter(Boolean)
		.join(" ");

	const scopeClass = `sv-${item.id.replace(/[^a-zA-Z0-9]/g, "")}`;
	const svgTags = ["circle", "rect", "polygon", "path", "polyline", "ellipse", "line"];
	const scopedSelectors = svgTags.map((t) => `.${scopeClass} ${t}`).join(",");
	const styledSvg = rawSvg.replace(
		/(<svg\b)([^>]*>)/i,
		`$1 class="${scopeClass}"$2<style>${scopedSelectors}{${styleRules}}</style>`,
	);

	const children = (
		<BoxAnim
			style={calculateContainerStyles(details)}
			animationIn={animationIn}
			animationOut={animationOut}
			frame={currentFrame}
			durationInFrames={durationInFrames}
		>
			<ContentAnim
				animationTimed={animationTimed}
				durationInFrames={durationInFrames}
				frame={currentFrame}
				style={calculateContainerStyles(details)}
			>
				<MaskAnim item={item} keyframeAnimations={animationTimed} frame={frame || 0}>
					<div
						style={{ width: "100%", height: "100%" }}
						dangerouslySetInnerHTML={{ __html: styledSvg }}
					/>
				</MaskAnim>
			</ContentAnim>
		</BoxAnim>
	);
	return BaseSequence({ item, options, children });
};

export default Shape;
