import { useEffect, useState } from "react";
import ColorPicker from "@/components/color-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsLargeScreen } from "@/hooks/use-media-query";
import useLayoutStore from "../../store/use-layout-store";

function Outline({
	label,
	onChageBorderWidth,
	onChangeBorderColor,
	valueBorderWidth,
	valueBorderColor,
}: {
	label: string;
	onChageBorderWidth: (v: number) => void;
	onChangeBorderColor: (v: string) => void;
	valueBorderWidth: number;
	valueBorderColor: string;
}) {
	const [localValueBorderWidth, setLocalValueBorderWidth] = useState<string | number>(
		valueBorderWidth,
	);
	const [localValueBorderColor, setLocalValueBorderColor] = useState<string>(valueBorderColor);
	const [open, setOpen] = useState(false);
	const isLargeScreen = useIsLargeScreen();
	const { setControItemDrawerOpen, setTypeControlItem, setLabelControlItem } = useLayoutStore();

	useEffect(() => {
		setLocalValueBorderWidth(valueBorderWidth);
		setLocalValueBorderColor(valueBorderColor);
	}, [valueBorderWidth, valueBorderColor]);

	const handleColorClick = () => {
		if (!isLargeScreen) {
			setControItemDrawerOpen(true);
			setTypeControlItem("strokeColor");
			setLabelControlItem("Stroke Color");
		}
	};

	return (
		<div className="flex flex-col gap-2 py-4">
			<Label className="font-sans text-xs font-semibold">{label}</Label>

			<div className="flex flex-col gap-1">
				<span className="text-xs text-muted-foreground">צבע</span>
				{isLargeScreen ? (
					<Popover open={open} onOpenChange={setOpen}>
						<PopoverTrigger asChild>
							<button type="button" className="relative w-full cursor-pointer text-right">
								<div
									style={{ backgroundColor: localValueBorderColor }}
									className="absolute right-0.5 top-0.5 h-7 w-7 flex-none rounded-md border border-border"
								/>
								<Input
									className="pointer-events-none h-8 pr-10 w-full"
									value={localValueBorderColor}
									onChange={() => {}}
								/>
							</button>
						</PopoverTrigger>
						<PopoverContent side="bottom" align="end" className="z-[300] w-[280px] p-4">
							<ColorPicker
								value={localValueBorderColor}
								format="hex"
								gradient={false}
								solid={true}
								onChange={(v: string) => {
									setLocalValueBorderColor(v);
									onChangeBorderColor(v);
								}}
								allowAddGradientStops={false}
							/>
						</PopoverContent>
					</Popover>
				) : (
					<div className="relative cursor-pointer" onClick={handleColorClick}>
						<div
							style={{ backgroundColor: localValueBorderColor }}
							className="absolute right-0.5 top-0.5 h-7 w-7 flex-none rounded-md border border-border"
						/>
						<Input
							className="pointer-events-none h-8 pr-10 w-full"
							value={localValueBorderColor}
							onChange={() => {}}
						/>
					</div>
				)}
			</div>

			<div className="flex flex-col gap-1">
				<span className="text-xs text-muted-foreground">גודל</span>
				<Input
					type="text"
					className="h-8 w-full"
					onChange={(e) => {
						const newValue = e.target.value;
						if (
							newValue === "" ||
							(!Number.isNaN(Number(newValue)) && Number(newValue) >= 0 && Number(newValue) <= 100)
						) {
							setLocalValueBorderWidth(newValue);
							if (newValue !== "") {
								onChageBorderWidth(Number(newValue));
							}
						}
					}}
					value={localValueBorderWidth}
				/>
			</div>
		</div>
	);
}

export default Outline;
