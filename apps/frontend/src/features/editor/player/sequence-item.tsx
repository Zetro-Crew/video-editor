import type { ITrackItem } from "@designcombo/types";
import type React from "react";
import type { SequenceItemOptions } from "./base-sequence";
import Audio from "./items/audio";
import Caption from "./items/caption";
import HillAudioBars from "./items/hill-audio-bars";
import Illustration from "./items/illustration";
import Image from "./items/image";
import LinealAudioBars from "./items/lineal-audio-bars";
import ProgressBar from "./items/progress-bar";
import ProgressFrame from "./items/progress-frame";
import RadialAudioBars from "./items/radial-audio-bars";
import Shape from "./items/shape";
import Text from "./items/text";
import Video from "./items/video";
import WaveAudioBars from "./items/wave-audio-bars";

export type SequenceItemComponent = React.ComponentType<{
	item: ITrackItem;
	options: SequenceItemOptions;
}>;

// Component map — use JSX (<Component item={item} options={options} />) so each item
// has its own React component boundary. This lets React.memo on the wrapper prevent
// re-renders from parent churn while items subscribe to useCurrentFrame() independently.
export const SequenceItemMap: Record<string, SequenceItemComponent> = {
	text: Text as SequenceItemComponent,
	caption: Caption as SequenceItemComponent,
	shape: Shape as SequenceItemComponent,
	video: Video as SequenceItemComponent,
	audio: Audio as SequenceItemComponent,
	image: Image as SequenceItemComponent,
	illustration: Illustration as SequenceItemComponent,
	progressBar: ProgressBar as SequenceItemComponent,
	linealAudioBars: LinealAudioBars as SequenceItemComponent,
	waveAudioBars: WaveAudioBars as SequenceItemComponent,
	hillAudioBars: HillAudioBars as SequenceItemComponent,
	progressFrame: ProgressFrame as SequenceItemComponent,
	radialAudioBars: RadialAudioBars as SequenceItemComponent,
};
