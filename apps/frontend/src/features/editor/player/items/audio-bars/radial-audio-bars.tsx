import type { IRadialAudioBars } from "@designcombo/types";
import { Html5Audio, useCurrentFrame } from "remotion";
import type { SequenceItemOptions } from "../../base-sequence";
import { audioDataManager } from "../../lib/audio-data";
import { RadialBarsVisualization } from "./radial-bars-visualization";

export const RadialBars = ({
	item,
	options,
}: {
	item: IRadialAudioBars;
	options: SequenceItemOptions;
}) => {
	const frame = useCurrentFrame();
	const { fps } = options;
	const { details } = item;
	const playbackRate = item.playbackRate || 1;

	audioDataManager.setAudioDataManager(fps);

	const nSamples = 512;
	const visualizationValues = audioDataManager.getAudioDataForFrame(frame || 0);

	const frequencyData = visualizationValues.slice(0, 0.7 * nSamples);
	return (
		<>
			<RadialBarsVisualization
				frequencyData={frequencyData}
				diameter={details.width}
				innerRadius={details.width / 4}
				color={details.radialBarColor}
			/>
			{details.reproduceAudio &&
				details.srcs.map((src, index) => {
					return <Html5Audio key={index} playbackRate={playbackRate} src={src} />;
				})}
		</>
	);
};
