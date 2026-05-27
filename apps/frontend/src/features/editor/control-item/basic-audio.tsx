import type { IAudio, ITrackItem } from "@designcombo/types";
import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTrackItemEditor } from "../hooks/use-track-item-editor";
import Speed from "./common/speed";
import Volume from "./common/volume";

const BasicAudio = ({ trackItem, type }: { trackItem: ITrackItem & IAudio; type?: string }) => {
	const showAll = !type;
	const { properties, update } = useTrackItemEditor(trackItem);

	const components = [
		{
			key: "speed",
			component: (
				<Speed
					value={properties.playbackRate ?? 1}
					onChange={(v: number) => update({ playbackRate: v })}
				/>
			),
		},
		{
			key: "volume",
			component: (
				<Volume
					onChange={(v: number) => update({ details: { volume: v } })}
					value={properties.details.volume ?? 100}
				/>
			),
		},
	];

	return (
		<div dir="rtl" className="flex flex-1 flex-col">
			<ScrollArea className="h-full">
				<div className="flex flex-col gap-2 px-4 py-4">
					{components
						.filter((comp) => showAll || comp.key === type)
						.map((comp) => (
							<React.Fragment key={comp.key}>{comp.component}</React.Fragment>
						))}
				</div>
			</ScrollArea>
		</div>
	);
};

export default BasicAudio;
