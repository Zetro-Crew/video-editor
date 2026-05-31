import type {
	IAudio,
	ICaption,
	IImage,
	IShape,
	IText,
	ITrackItem,
	ITrackItemAndDetails,
	IVideo,
} from "@designcombo/types";
import { useEffect } from "react";
import useActiveItem from "../hooks/use-active-item";
import { MenuItem } from "../menu-item/menu-item";
import useLayoutStore from "../store/use-layout-store";
import BasicAudio from "./basic-audio";
import BasicCaption from "./basic-caption";
import BasicImage from "./basic-image";
import BasicShape from "./basic-shape";
import BasicText from "./basic-text";
import BasicVideo from "./basic-video";

const ActiveControlItem = ({ trackItem }: { trackItem?: ITrackItemAndDetails }) => {
	if (!trackItem) {
		return null;
	}
	return (
		<>
			{
				{
					text: <BasicText trackItem={trackItem as ITrackItem & IText} />,
					caption: <BasicCaption trackItem={trackItem as ITrackItem & ICaption} />,
					image: <BasicImage trackItem={trackItem as ITrackItem & IImage} />,
					video: <BasicVideo trackItem={trackItem as ITrackItem & IVideo} />,
					audio: <BasicAudio trackItem={trackItem as ITrackItem & IAudio} />,
					shape: <BasicShape trackItem={trackItem as ITrackItem & IShape} />,
				}[trackItem.type as "text"]
			}
		</>
	);
};

export const ControlItem = () => {
	const trackItem = useActiveItem();
	const { showMenuItem, controlItemOpen, setControlItemOpen } = useLayoutStore();

	useEffect(() => {
		if (!trackItem) setControlItemOpen(false);
	}, [trackItem]);

	if (!trackItem && !showMenuItem) return null;
	if (!controlItemOpen && !showMenuItem) return null;

	return (
		<div
			dir="rtl"
			className="h-full w-full overflow-y-auto border-l border-border/80 bg-card shadow-xl"
		>
			{trackItem ? <ActiveControlItem trackItem={trackItem} /> : <MenuItem />}
		</div>
	);
};
