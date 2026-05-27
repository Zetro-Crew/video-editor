import { BoxAnim, ContentAnim, MaskAnim } from "@designcombo/animations";
import type { IVideo } from "@designcombo/types";
import { Video as RemotionMediaVideo } from "@remotion/media";
import { OffthreadVideo, useCurrentFrame } from "remotion";
import { isLikelyHlsSrc } from "../../external-preview/utils";
import { calculateFrames } from "../../utils/frames";
import { getAnimations } from "../../utils/get-animations";
import { BaseSequence, type SequenceItemOptions } from "../base-sequence";
import { calculateContainerStyles, calculateMediaStyles } from "../styles";

const Video = ({ item, options }: { item: IVideo; options: SequenceItemOptions }) => {
	const frame = useCurrentFrame();
	const { fps } = options;
	const { details, animations } = item;
	const playbackRate = item.playbackRate || 1;
	const volume = Math.min(Math.max((details.volume ?? 100) / 100, 0), 1);
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
	const isHls = isLikelyHlsSrc(details.src);

	const children = (
		<BoxAnim
			style={calculateContainerStyles(details, crop, {
				overflow: "hidden",
			})}
			animationIn={animationIn}
			animationOut={animationOut}
			frame={currentFrame}
			durationInFrames={durationInFrames}
		>
			<ContentAnim
				animationTimed={animationTimed}
				durationInFrames={durationInFrames}
				frame={currentFrame}
			>
				<MaskAnim item={item} keyframeAnimations={animationTimed} frame={frame || 0}>
					<div style={calculateMediaStyles(details, crop)}>
						{isHls ? (
							<RemotionMediaVideo
								trimBefore={(item.trim?.from! / 1000) * fps}
								trimAfter={(item.trim?.to! / 1000) * fps || 1 / fps}
								playbackRate={playbackRate}
								src={details.src}
								volume={volume}
							/>
						) : (
							<OffthreadVideo
								startFrom={(item.trim?.from! / 1000) * fps}
								endAt={(item.trim?.to! / 1000) * fps || 1 / fps}
								playbackRate={playbackRate}
								src={details.src}
								volume={volume}
							/>
						)}
					</div>
				</MaskAnim>
			</ContentAnim>
		</BoxAnim>
	);

	return BaseSequence({ item, options, children });
};

export default Video;
