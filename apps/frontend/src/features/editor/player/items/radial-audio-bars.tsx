import type { IRadialAudioBars } from "@designcombo/types";
import { BaseSequence, type SequenceItemOptions } from "../base-sequence";
import { RadialBars } from "./audio-bars/radial-audio-bars";

export default function RadialAudioBars({
	item,
	options,
}: {
	item: IRadialAudioBars;
	options: SequenceItemOptions;
}) {
	const children = (
		<>
			<RadialBars item={item} options={options} />
		</>
	);

	return BaseSequence({ item, options, children });
}
