import type { IShape, IShapeDetails, ITrackItem } from "@designcombo/types";
import React from "react";
import ColorPicker from "@/components/color-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTrackItemEditor } from "../hooks/use-track-item-editor";
import Opacity from "./common/opacity";
import Outline from "./common/outline";
import Rounded from "./common/radius";

const BasicShape = ({ trackItem, type }: { trackItem: ITrackItem & IShape; type?: string }) => {
	const showAll = !type;
	const { properties, update } = useTrackItemEditor(trackItem);
	const d = properties.details as IShapeDetails;

	const isFilled = d.backgroundColor !== "transparent";

	const components = [
		{
			key: "strokeColor",
			component: (
				<Outline
					label="מסגרת"
					valueBorderWidth={d.borderWidth || 1}
					valueBorderColor={d.borderColor ?? "#000000"}
					onChageBorderWidth={(v: number) => update({ details: { borderWidth: v } })}
					onChangeBorderColor={(v: string) => update({ details: { borderColor: v } })}
				/>
			),
		},
		{
			key: "basic",
			component: (
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label className="font-sans text-xs font-semibold">מילוי</Label>
						<div className="flex gap-2">
							<Button
								variant={isFilled ? "default" : "secondary"}
								size="sm"
								className="flex-1"
								onClick={() =>
									update({
										details: {
											backgroundColor: isFilled ? "transparent" : "#ffffff",
										},
									})
								}
							>
								מלא
							</Button>
							<Button
								variant={!isFilled ? "default" : "secondary"}
								size="sm"
								className="flex-1"
								onClick={() =>
									update({
										details: {
											backgroundColor: isFilled ? "transparent" : "#ffffff",
										},
									})
								}
							>
								מסגרת בלבד
							</Button>
						</div>
					</div>

					{isFilled && (
						<div className="flex flex-col gap-2">
							<Label className="font-sans text-xs font-semibold">צבע מילוי</Label>
							<div className="flex items-center justify-center pb-2">
								<ColorPicker
									value={d.backgroundColor}
									format="hex"
									gradient={false}
									solid={true}
									onChange={(color: string) => update({ details: { backgroundColor: color } })}
									allowAddGradientStops={false}
								/>
							</div>
						</div>
					)}

					<Outline
						label="מסגרת"
						valueBorderWidth={d.borderWidth || 1}
						valueBorderColor={d.borderColor ?? "#000000"}
						onChageBorderWidth={(v: number) => update({ details: { borderWidth: v } })}
						onChangeBorderColor={(v: string) => update({ details: { borderColor: v } })}
					/>

					<Rounded
						onChange={(v: number) => update({ details: { borderRadius: v } })}
						value={d.borderRadius ?? 0}
					/>

					<Opacity
						onChange={(v: number) => update({ details: { opacity: v } })}
						value={d.opacity ?? 100}
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
						.filter((comp) => (showAll ? comp.key === "basic" : comp.key === type))
						.map((comp) => (
							<React.Fragment key={comp.key}>{comp.component}</React.Fragment>
						))}
				</div>
			</ScrollArea>
		</div>
	);
};

export default BasicShape;
