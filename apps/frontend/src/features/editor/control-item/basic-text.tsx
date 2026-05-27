import type { IBoxShadow, IText, ITextDetails, ITrackItem } from "@designcombo/types";
import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTrackItemEditor } from "../hooks/use-track-item-editor";
import { TextControls } from "./common/text";

interface ITextControlProps {
	text: string;
	color: string;
	colorDisplay: string;
	backgroundColor: string;
	fontSize: number;
	fontSizeDisplay: string;
	opacityDisplay: string;
	textAlign: string;
	textDecoration: string;
	borderWidth: number;
	borderColor: string;
	opacity: number;
	boxShadow: IBoxShadow;
}

const BasicText = ({ trackItem, type }: { trackItem: ITrackItem & IText; type?: string }) => {
	const showAll = !type;
	const { properties, update } = useTrackItemEditor(trackItem);
	const d = properties.details as ITextDetails;

	const textProperties: ITextControlProps = {
		text: d.text || "",
		color: d.color || "#ffffff",
		colorDisplay: d.color || "#ffffff",
		backgroundColor: d.backgroundColor || "transparent",
		fontSize: d.fontSize || 62,
		fontSizeDisplay: `${d.fontSize || 62}px`,
		opacity: d.opacity || 1,
		opacityDisplay: `${d.opacity || "100"}%`,
		textAlign: d.textAlign || "left",
		textDecoration: d.textDecoration || "none",
		borderWidth: d.borderWidth || 0,
		borderColor: d.borderColor || "#000000",
		boxShadow: d.boxShadow || { color: "#000000", x: 0, y: 0, blur: 0 },
	};

	const components = [
		{
			key: "textControls",
			component: (
				<TextControls
					trackItem={trackItem}
					properties={textProperties}
					textValue={textProperties.text}
					onChangeText={(text: string) => update({ details: { text } })}
					onChangeFontSize={(v: number) => update({ details: { fontSize: v } })}
					handleColorChange={(color: string) => update({ details: { color } })}
					handleBackgroundChange={(color: string) =>
						update({ details: { backgroundColor: color } })
					}
					onChangeTextAlign={(v: string) => update({ details: { textAlign: v } })}
					onChangeTextDecoration={(v: string) => update({ details: { textDecoration: v } })}
					handleChangeOpacity={(v: number) => update({ details: { opacity: v } })}
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

export default BasicText;
