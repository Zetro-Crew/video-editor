import type { IBoxShadow, ICaption, ICaptionDetails, ITrackItem } from "@designcombo/types";
import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTrackItemEditor } from "../hooks/use-track-item-editor";
import CaptionColors from "./common/caption-colors";
import CaptionWords from "./common/caption-words";
import { TextControls } from "./common/text";

interface ITextControlProps {
	color: string;
	colorDisplay: string;
	appearedColor: string;
	activeColor: string;
	activeFillColor: string;
	fontSize: number;
	fontSizeDisplay: string;
	opacityDisplay: string;
	textAlign: string;
	textDecoration: string;
	borderWidth: number;
	borderColor: string;
	opacity: number;
	boxShadow: IBoxShadow;
	isKeywordColor: string;
	preservedColorKeyWord: boolean;
}

const BasicCaption = ({ trackItem, type }: { trackItem: ITrackItem & ICaption; type?: string }) => {
	const showAll = !type;
	const { properties, update } = useTrackItemEditor(trackItem);
	const d = properties.details as ICaptionDetails;

	const captionProperties: ITextControlProps = {
		color: d.color || "#ffffff",
		colorDisplay: d.color || "#ffffff",
		fontSize: d.fontSize || 62,
		fontSizeDisplay: `${d.fontSize || 62}px`,
		opacity: d.opacity || 100,
		opacityDisplay: `${(d.opacity || 1) * 100 || "100"}%`,
		textAlign: d.textAlign || "left",
		textDecoration: d.textDecoration || "none",
		borderWidth: d.borderWidth || 0,
		borderColor: d.borderColor || "#000000",
		appearedColor: d.appearedColor || "#ffffff",
		activeColor: d.activeColor || "#ffffff",
		activeFillColor: d.activeFillColor || "#ffffff",
		isKeywordColor: d.isKeywordColor || "transparent",
		preservedColorKeyWord: d.preservedColorKeyWord || false,
		boxShadow: d.boxShadow || { color: "#000000", x: 0, y: 0, blur: 0 },
	};

	const components = [
		{
			key: "captionWords",
			component: <CaptionWords id={trackItem.id} trackItem={trackItem} />,
		},
		{
			key: "captionColors",
			component: (
				<CaptionColors
					id={trackItem.id}
					activeColor={captionProperties.activeColor}
					activeFillColor={captionProperties.activeFillColor}
					appearedColor={captionProperties.appearedColor}
					isKeywordColor={captionProperties.isKeywordColor}
					preservedColorKeyWord={captionProperties.preservedColorKeyWord}
				/>
			),
		},
		{
			key: "textControls",
			component: (
				<TextControls
					trackItem={trackItem}
					properties={captionProperties}
					onChangeFontSize={(v: number) => update({ details: { fontSize: v } })}
					handleColorChange={(color: string) => update({ details: { color } })}
					onChangeTextAlign={(v: string) => update({ details: { textAlign: v } })}
					onChangeTextDecoration={(v: string) => update({ details: { textDecoration: v } })}
					handleChangeOpacity={(v: number) => update({ details: { opacity: v } })}
					handleBackgroundChange={() => {}}
				/>
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

export default BasicCaption;
