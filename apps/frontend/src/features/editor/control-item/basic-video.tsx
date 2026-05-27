import type { ITrackItem, IVideo } from "@designcombo/types";
import { Crop } from "lucide-react";
import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTrackItemEditor } from "../hooks/use-track-item-editor";
import useLayoutStore from "../store/use-layout-store";
import Opacity from "./common/opacity";
import Rounded from "./common/radius";
import Speed from "./common/speed";
import Volume from "./common/volume";

const BasicVideo = ({ trackItem, type }: { trackItem: ITrackItem & IVideo; type?: string }) => {
	const showAll = !type;
	const { properties, update } = useTrackItemEditor(trackItem);
	const { setCropTarget } = useLayoutStore();

	const components = [
		{
			key: "basic",
			component: (
				<div className="flex flex-col gap-2">
					<Label className="font-sans text-xs font-semibold">בסיסי</Label>
					<div className="mb-2">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant={"secondary"}
									size={"icon"}
									onClick={() => {
										setCropTarget(trackItem);
									}}
								>
									<Crop size={18} />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top">חתוך וידאו</TooltipContent>
						</Tooltip>
					</div>
					<Volume
						onChange={(v: number) => update({ details: { volume: v } })}
						value={properties.details.volume ?? 100}
					/>
					<Opacity
						onChange={(v: number) => update({ details: { opacity: v } })}
						value={properties.details.opacity ?? 100}
					/>
					<Speed
						value={properties.playbackRate ?? 1}
						onChange={(v: number) => update({ playbackRate: v })}
					/>
					<Rounded
						onChange={(v: number) => update({ details: { borderRadius: v } })}
						value={properties.details.borderRadius as number}
					/>
				</div>
			),
		},
	];

	return (
		<div
			dir="rtl"
			className="flex lg:h-[calc(100vh-84px)] flex-1 flex-col overflow-hidden min-h-[340px]"
		>
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

export default BasicVideo;
