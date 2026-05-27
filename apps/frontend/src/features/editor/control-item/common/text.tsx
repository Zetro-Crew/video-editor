import { dispatch } from "@designcombo/events";
import { EDIT_OBJECT } from "@designcombo/state";
import type { ITrackItem } from "@designcombo/types";
import { ChevronDown, Strikethrough, Underline, X } from "lucide-react";
import { useEffect, useState } from "react";
import ColorPicker from "@/components/color-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsLargeScreen } from "@/hooks/use-media-query";
import useLayoutStore from "../../store/use-layout-store";
import Opacity from "./opacity";

interface TextControlsProps {
	trackItem: ITrackItem & any;
	properties: any;
	textValue?: string;
	onChangeText?: (value: string) => void;
	onChangeFontSize: (v: number) => void;
	handleColorChange: (color: string) => void;
	handleBackgroundChange: (color: string) => void;
	onChangeTextAlign: (v: string) => void;
	onChangeTextDecoration: (v: string) => void;
	handleChangeOpacity: (v: number) => void;
}

export const TextControls = ({
	trackItem,
	properties,
	textValue,
	onChangeText,
	onChangeFontSize,
	handleColorChange,
	handleBackgroundChange,
	onChangeTextAlign,
	onChangeTextDecoration,
	handleChangeOpacity,
}: TextControlsProps) => {
	return (
		<div className="flex flex-col gap-2 py-4">
			{typeof onChangeText === "function" ? (
				<TextContent value={textValue || ""} onChange={onChangeText} />
			) : null}
			<Label className="font-sans text-xs font-semibold">סגנונות</Label>
			<FontSize value={properties.fontSize} onChange={onChangeFontSize} />
			<FontColor value={properties.color} handleColorChange={handleColorChange} />
			<FontBackground
				value={properties.backgroundColor}
				handleColorChange={handleBackgroundChange}
			/>
			<Alignment value={properties.textAlign} onChange={onChangeTextAlign} />
			<TextDecoration value={properties.textDecoration} onChange={onChangeTextDecoration} />
			<FontCase id={trackItem.id} />

			<Opacity onChange={(v: number) => handleChangeOpacity(v)} value={properties.opacity ?? 100} />
		</div>
	);
};

const TextContent = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
	return (
		<div className="flex flex-col gap-2">
			<Label className="font-sans text-xs font-semibold">תוכן</Label>
			<Textarea
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="min-h-[120px] resize-y"
			/>
		</div>
	);
};

const FontBackground = ({
	value,
	handleColorChange,
}: {
	value: string;
	handleColorChange: (color: string) => void;
}) => {
	const [localValue, setLocalValue] = useState<string>(value);
	const [open, setOpen] = useState(false);
	const isLargeScreen = useIsLargeScreen();
	const { setControItemDrawerOpen, setTypeControlItem, setLabelControlItem } = useLayoutStore();

	useEffect(() => {
		setLocalValue(value);
	}, [value]);

	const handleColorClick = () => {
		if (!isLargeScreen) {
			setControItemDrawerOpen(true);
			setTypeControlItem("backgroundColor");
			setLabelControlItem("Background Color");
		}
	};

	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs text-muted-foreground">מילוי</span>
			{isLargeScreen ? (
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>
						<div className="relative cursor-pointer">
							<div
								style={{ background: localValue || "#ffffff" }}
								className="absolute right-0.5 top-0.5 h-7 w-7 flex-none rounded-md border border-border"
							/>
							<Input
								className="pointer-events-none h-8 pr-10 w-full"
								value={localValue}
								onChange={() => {}}
							/>
						</div>
					</PopoverTrigger>
					<PopoverContent side="bottom" align="end" className="z-[300] w-[280px] p-4">
						<div className="drag-handle flex w-[266px] cursor-grab justify-between rounded-t-lg bg-popover px-4 pt-4">
							<p className="text-sm font-bold">מילוי</p>
							<div className="h-4 w-4" onClick={() => setOpen(false)}>
								<X className="h-4 w-4 cursor-pointer font-extrabold text-muted-foreground" />
							</div>
						</div>
						<ColorPicker
							value={localValue}
							format="hex"
							gradient={true}
							solid={true}
							onChange={(v: string) => {
								setLocalValue(v);
								handleColorChange(v);
							}}
							allowAddGradientStops={true}
						/>
					</PopoverContent>
				</Popover>
			) : (
				<div className="relative cursor-pointer" onClick={handleColorClick}>
					<div
						style={{ background: localValue || "#ffffff" }}
						className="absolute right-0.5 top-0.5 h-7 w-7 flex-none rounded-md border border-border"
					/>
					<Input
						className="pointer-events-none h-8 pr-10 w-full"
						value={localValue}
						onChange={() => {}}
					/>
				</div>
			)}
		</div>
	);
};
const FontColor = ({
	value,
	handleColorChange,
}: {
	value: string;
	handleColorChange: (color: string) => void;
}) => {
	const [localValue, setLocalValue] = useState<string>(value);
	const [open, setOpen] = useState(false);
	const isLargeScreen = useIsLargeScreen();
	const { setControItemDrawerOpen, setTypeControlItem, setLabelControlItem } = useLayoutStore();

	useEffect(() => {
		setLocalValue(value);
	}, [value]);

	const handleColorClick = () => {
		if (!isLargeScreen) {
			setControItemDrawerOpen(true);
			setTypeControlItem("color");
			setLabelControlItem("Color");
		}
	};

	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs text-muted-foreground">צבע</span>
			{isLargeScreen ? (
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>
						<div className="relative cursor-pointer">
							<div
								style={{ background: localValue || "#ffffff" }}
								className="absolute right-0.5 top-0.5 h-7 w-7 flex-none rounded-md border border-border"
							/>
							<Input
								className="pointer-events-none h-8 pr-10 w-full"
								value={localValue}
								onChange={() => {}}
							/>
						</div>
					</PopoverTrigger>
					<PopoverContent side="bottom" align="end" className="z-[300] w-[280px] p-4">
						<div className="drag-handle flex w-[266px] cursor-grab justify-between rounded-t-lg bg-popover px-4 pt-4">
							<p className="text-sm font-bold">צבע</p>
							<div className="h-4 w-4" onClick={() => setOpen(false)}>
								<X className="h-4 w-4 cursor-pointer font-extrabold text-muted-foreground" />
							</div>
						</div>
						<ColorPicker
							value={localValue}
							format="hex"
							gradient={true}
							solid={true}
							onChange={(v: string) => {
								setLocalValue(v);
								handleColorChange(v);
							}}
							allowAddGradientStops={true}
						/>
					</PopoverContent>
				</Popover>
			) : (
				<div className="relative cursor-pointer" onClick={handleColorClick}>
					<div
						style={{ background: localValue || "#ffffff" }}
						className="absolute right-0.5 top-0.5 h-7 w-7 flex-none rounded-md border border-border"
					/>
					<Input
						className="pointer-events-none h-8 pr-10 w-full"
						value={localValue}
						onChange={() => {}}
					/>
				</div>
			)}
		</div>
	);
};

const FontSize = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => {
	const [localValue, setLocalValue] = useState<string | number>(value);

	useEffect(() => {
		setLocalValue(value);
	}, [value]);

	const handleBlur = () => {
		if (localValue !== "") {
			onChange(Number(localValue)); // Propagate as a number
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			if (localValue !== "") {
				onChange(Number(localValue)); // Propagate as a number
			}
		}
	};

	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs text-muted-foreground">גודל</span>
			<Input
				className="h-8 w-full"
				value={localValue}
				onChange={(e) => {
					const newValue = e.target.value;
					if (newValue === "" || (!Number.isNaN(Number(newValue)) && Number(newValue) >= 0)) {
						setLocalValue(newValue);
					}
				}}
				onBlur={handleBlur}
				onKeyDown={handleKeyDown}
			/>
		</div>
	);
};

const TextDecoration = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
	const [localValue, setLocalValue] = useState<string>(value);

	useEffect(() => {
		setLocalValue(value);
	}, [value]);
	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs text-muted-foreground">קישוט</span>
			<div className="flex gap-2">
				<div className="relative w-full">
					<ToggleGroup
						value={localValue.split(" ")}
						size="sm"
						className="grid grid-cols-3"
						type="multiple"
						onValueChange={(v) => onChange(v.filter((v) => v !== "none").join(" "))}
					>
						<ToggleGroupItem size="sm" value="underline" aria-label="Toggle left">
							<Underline size={18} />
						</ToggleGroupItem>
						<ToggleGroupItem value="line-through" aria-label="Toggle italic">
							<Strikethrough size={18} />
						</ToggleGroupItem>
						<ToggleGroupItem value="overline" aria-label="Toggle strikethrough">
							<div>
								<svg width={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
									<path
										fillRule="evenodd"
										clipRule="evenodd"
										d="M5.59996 1.75977C5.43022 1.75977 5.26744 1.82719 5.14741 1.94722C5.02739 2.06724 4.95996 2.23003 4.95996 2.39977C4.95996 2.5695 5.02739 2.73229 5.14741 2.85231C5.26744 2.97234 5.43022 3.03977 5.59996 3.03977H18.4C18.5697 3.03977 18.7325 2.97234 18.8525 2.85231C18.9725 2.73229 19.04 2.5695 19.04 2.39977C19.04 2.23003 18.9725 2.06724 18.8525 1.94722C18.7325 1.82719 18.5697 1.75977 18.4 1.75977H5.59996ZM7.99996 6.79977C7.99996 6.58759 7.91568 6.38411 7.76565 6.23408C7.61562 6.08405 7.41213 5.99977 7.19996 5.99977C6.98779 5.99977 6.7843 6.08405 6.63428 6.23408C6.48425 6.38411 6.39996 6.58759 6.39996 6.79977V15.2798C6.39996 16.765 6.98996 18.1894 8.04016 19.2396C9.09037 20.2898 10.5147 20.8798 12 20.8798C13.4852 20.8798 14.9096 20.2898 15.9598 19.2396C17.01 18.1894 17.6 16.765 17.6 15.2798V6.79977C17.6 6.58759 17.5157 6.38411 17.3656 6.23408C17.2156 6.08405 17.0121 5.99977 16.8 5.99977C16.5878 5.99977 16.3843 6.08405 16.2343 6.23408C16.0842 6.38411 16 6.58759 16 6.79977V15.2798C16 16.3406 15.5785 17.358 14.8284 18.1082C14.0782 18.8583 13.0608 19.2798 12 19.2798C10.9391 19.2798 9.92168 18.8583 9.17153 18.1082C8.42139 17.358 7.99996 16.3406 7.99996 15.2798V6.79977Z"
										fill="currentColor"
									/>
								</svg>
							</div>
						</ToggleGroupItem>
					</ToggleGroup>
				</div>
			</div>
		</div>
	);
};

const fontAlignmentOptions = [
	{ value: "left", label: "שמאל" },
	{ value: "center", label: "מרכז" },
	{ value: "right", label: "ימין" },
];

const Alignment = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
	const [localValue, setLocalValue] = useState<string>(value);

	useEffect(() => {
		setLocalValue(value);
	}, [value]);

	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs text-muted-foreground">יישור</span>
			<Popover>
				<PopoverTrigger asChild>
					<Button
						className="flex h-8 w-full items-center justify-between text-sm"
						variant="secondary"
					>
						<div className="w-full overflow-hidden text-right">
							<p className="truncate">{localValue}</p>
						</div>
						<ChevronDown className="text-muted-foreground" size={14} />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="z-[300] w-40 p-0 py-1">
					{fontAlignmentOptions.map((option, index) => (
						<div
							onClick={() => {
								setLocalValue(option.value);
								onChange(option.value);
							}}
							className="flex h-8 cursor-pointer items-center px-4 text-sm text-zinc-200 hover:bg-zinc-800/50"
							key={index}
						>
							{option.label}
						</div>
					))}
				</PopoverContent>
			</Popover>
		</div>
	);
};

const fontCaseOptions = [
	{ value: "none", label: "כמו שנכתב" },
	{ value: "uppercase", label: "אותיות גדולות" },
	{ value: "lowercase", label: "אותיות קטנות" },
];

const FontCase = ({ id }: { id: string }) => {
	const [value, setValue] = useState("none");
	const onChangeFontCase = (value: string) => {
		setValue(value);
		dispatch(EDIT_OBJECT, {
			payload: {
				[id]: {
					details: {
						textTransform: value,
					},
				},
			},
		});
	};
	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs text-muted-foreground">אותיות</span>
			<Popover>
				<PopoverTrigger asChild>
					<Button
						className="flex h-8 w-full items-center justify-between text-sm"
						variant="secondary"
					>
						<div className="w-full overflow-hidden text-right">
							<p className="truncate">{value}</p>
						</div>
						<ChevronDown className="text-muted-foreground" size={14} />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="z-[300] w-40 p-0 py-1">
					{fontCaseOptions.map((option, index) => (
						<div
							onClick={() => onChangeFontCase(option.value)}
							className="flex h-8 cursor-pointer items-center px-4 text-sm text-zinc-200 hover:bg-zinc-800/50"
							key={index}
						>
							{option.label}
						</div>
					))}
				</PopoverContent>
			</Popover>
		</div>
	);
};
