import type { ILinealAudioBars } from "@designcombo/types";
import { BaseSequence, type SequenceItemOptions } from "../base-sequence";
import { LinealBars } from "./audio-bars/lineal-audio-bars";

export default function LinealAudioBars({
	item,
	options,
}: {
	item: ILinealAudioBars;
	options: SequenceItemOptions;
}) {
	const children = (
		<>
			<LinealBars item={item} options={options} />
		</>
	);
	return BaseSequence({ item, options, children });
}
