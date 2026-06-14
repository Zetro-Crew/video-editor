import { dispatch } from "@designcombo/events";
import { EDIT_OBJECT } from "@designcombo/state";
import type { ITrackItem } from "@designcombo/types";
import {
	AlignCenter,
	AlignJustify,
	AlignLeft,
	AlignRight,
	Strikethrough,
	Underline,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import ColorPicker from "@/components/color-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
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
		<div className="flex flex-col gap-5">
			{typeof onChangeText === "function" && (
				<section className="flex flex-col gap-2">
					<Label className="text-xs font-semibold">תוכן</Label>
					<Textarea
						value={textValue ?? ""}
						onChange={(e) => onChangeText(e.target.value)}
						className="min-h-[100px] resize-y"
					/>
				</section>
			)}

			<section className="flex flex-col gap-3">
				<Label className="text-xs font-semibold">סגנון</Label>

				<FontSize value={properties.fontSize} onChange={onChangeFontSize} />

				<ColorField
					label="צבע טקסט"
					value={properties.color}
					drawerType="color"
					drawerLabel="Color"
					popoverTitle="צבע"
					onChange={handleColorChange}
				/>

				<ColorField
					label="מילוי"
					value={properties.backgroundColor}
					drawerType="backgroundColor"
					drawerLabel="Background Color"
					popoverTitle="מילוי"
					onChange={handleBackgroundChange}
				/>

				<Alignment value={properties.textAlign} onChange={onChangeTextAlign} />
				<TextDecoration value={properties.textDecoration} onChange={onChangeTextDecoration} />
				<FontCase id={trackItem.id} />

				<Opacity value={properties.opacity ?? 100} onChange={handleChangeOpacity} />
			</section>
		</div>
	);
};

// ─── Shared color field (text color + fill) ───────────────────────────────────

const ColorField = ({
	label,
	value,
	drawerType,
	drawerLabel,
	popoverTitle,
	onChange,
}: {
	label: string;
	value: string;
	drawerType: string;
	drawerLabel: string;
	popoverTitle: string;
	onChange: (color: string) => void;
}) => {
	const [localValue, setLocalValue] = useState(value);
	const [open, setOpen] = useState(false);
	const isLargeScreen = useIsLargeScreen();
	const { setControItemDrawerOpen, setTypeControlItem, setLabelControlItem } = useLayoutStore();

	useEffect(() => {
		setLocalValue(value);
	}, [value]);

	const handleChange = (v: string) => {
		setLocalValue(v);
		onChange(v);
	};

	const colorTrigger = (
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
	);

	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs text-muted-foreground">{label}</span>
			{isLargeScreen ? (
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>{colorTrigger}</PopoverTrigger>
					<PopoverContent side="bottom" align="end" className="z-[300] w-[280px] p-4">
						<div className="drag-handle flex w-[266px] cursor-grab justify-between rounded-t-lg bg-popover px-4 pt-4">
							<p className="text-sm font-bold">{popoverTitle}</p>
							<X
								className="h-4 w-4 cursor-pointer text-muted-foreground"
								onClick={() => setOpen(false)}
							/>
						</div>
						<ColorPicker
							value={localValue}
							format="hex"
							gradient={true}
							solid={true}
							onChange={handleChange}
							allowAddGradientStops={true}
						/>
					</PopoverContent>
				</Popover>
			) : (
				<div
					className="cursor-pointer"
					onClick={() => {
						setControItemDrawerOpen(true);
						setTypeControlItem(drawerType);
						setLabelControlItem(drawerLabel);
					}}
				>
					{colorTrigger}
				</div>
			)}
		</div>
	);
};

// ─── Font size: slider + synced numeric input ─────────────────────────────────

const FontSize = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => {
	const [localValue, setLocalValue] = useState(value);

	useEffect(() => {
		setLocalValue(Math.round(value));
	}, [value]);

	const commit = (v: number) => {
		const clamped = Math.max(1, Math.min(400, Math.round(v)));
		setLocalValue(clamped);
		onChange(clamped);
	};

	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs text-muted-foreground">גודל פונט</span>
			<div className="flex items-center gap-2">
				<Slider
					value={[localValue]}
					onValueChange={(e) => setLocalValue(Math.round(e[0]))}
					onValueCommit={(e) => onChange(Math.round(e[0]))}
					min={1}
					max={400}
					step={1}
					className="flex-1"
					aria-label="גודל פונט"
				/>
				<Input
					type="number"
					min={1}
					max={400}
					className="h-8 w-16 px-2 text-center text-sm"
					value={localValue}
					onChange={(e) => {
						const v = Number(e.target.value);
						if (!Number.isNaN(v)) setLocalValue(v);
					}}
					onBlur={() => commit(localValue)}
					onKeyDown={(e) => {
						if (e.key === "Enter") commit(localValue);
					}}
				/>
			</div>
		</div>
	);
};

// ─── Alignment: four icon buttons ─────────────────────────────────────────────
// dir="ltr" on the row is intentional:
//   • Prevents any global RTL CSS from mirroring the alignment SVG icons.
//   • Locks DOM order = visual order (left→right): Justify | Left | Center | Right,
//     which a Hebrew user reads right→left as: Right | Center | Left | Justify —
//     matching the expected RTL logical order.
// Plain <button> elements replace ToggleGroup to avoid Radix Rover issues in RTL.

const ALIGN_OPTIONS = [
	{ value: "justify", icon: <AlignJustify size={16} />, label: "מוצדק" },
	{ value: "left", icon: <AlignLeft size={16} />, label: "שמאל" },
	{ value: "center", icon: <AlignCenter size={16} />, label: "מרכז" },
	{ value: "right", icon: <AlignRight size={16} />, label: "ימין" },
] as const;

const Alignment = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
	const [localValue, setLocalValue] = useState(value || "right");

	useEffect(() => {
		setLocalValue(value || "right");
	}, [value]);

	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs text-muted-foreground">יישור</span>
			<div dir="ltr" className="flex gap-1">
				{ALIGN_OPTIONS.map(({ value: v, icon, label }) => (
					<button
						key={v}
						type="button"
						aria-label={label}
						aria-pressed={localValue === v}
						onClick={() => {
							setLocalValue(v);
							onChange(v);
						}}
						className={`flex flex-1 h-8 items-center justify-center rounded-md transition-colors ${
							localValue === v
								? "bg-primary text-primary-foreground"
								: "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
						}`}
					>
						{icon}
					</button>
				))}
			</div>
		</div>
	);
};

// ─── Text decoration: underline / strikethrough / overline ───────────────────

const OverlineIcon = () => (
	<svg width={16} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
		<path
			fillRule="evenodd"
			clipRule="evenodd"
			d="M5.6 1.76H18.4a.64.64 0 0 1 0 1.28H5.6a.64.64 0 0 1 0-1.28ZM8 6.8a.8.8 0 0 0-1.6 0v8.48a5.6 5.6 0 0 0 11.2 0V6.8a.8.8 0 0 0-1.6 0v8.48a4 4 0 0 1-8 0V6.8Z"
			fill="currentColor"
		/>
	</svg>
);

const TextDecoration = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
	const [localValue, setLocalValue] = useState(value || "none");

	useEffect(() => {
		setLocalValue(value || "none");
	}, [value]);

	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs text-muted-foreground">קישוט</span>
			<ToggleGroup
				type="multiple"
				value={localValue.split(" ")}
				size="sm"
				className="grid grid-cols-3 gap-1"
				onValueChange={(v) => onChange(v.filter((x) => x !== "none").join(" ") || "none")}
			>
				<ToggleGroupItem value="underline" aria-label="קו תחתי" size="sm">
					<Underline size={16} />
				</ToggleGroupItem>
				<ToggleGroupItem value="line-through" aria-label="קו חוצה" size="sm">
					<Strikethrough size={16} />
				</ToggleGroupItem>
				<ToggleGroupItem value="overline" aria-label="קו עליון" size="sm">
					<OverlineIcon />
				</ToggleGroupItem>
			</ToggleGroup>
		</div>
	);
};

// ─── Font case: dropdown ──────────────────────────────────────────────────────

const fontCaseOptions = [
	{ value: "none", label: "כמו שנכתב" },
	{ value: "uppercase", label: "אותיות גדולות" },
	{ value: "lowercase", label: "אותיות קטנות" },
] as const;

const FontCase = ({ id }: { id: string }) => {
	const [value, setValue] = useState<string>("none");

	const handleChange = (next: string) => {
		setValue(next);
		dispatch(EDIT_OBJECT, {
			payload: {
				[id]: { details: { textTransform: next } },
			},
		});
	};

	const currentLabel = fontCaseOptions.find((o) => o.value === value)?.label ?? "כמו שנכתב";

	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs text-muted-foreground">אותיות</span>
			<Popover>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="flex h-8 w-full items-center justify-between rounded-md bg-secondary px-3 text-sm hover:bg-secondary/80 transition-colors"
					>
						<span>{currentLabel}</span>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							className="text-muted-foreground"
						>
							<polyline points="6 9 12 15 18 9" />
						</svg>
					</button>
				</PopoverTrigger>
				<PopoverContent className="z-[300] w-44 p-0 py-1">
					{fontCaseOptions.map((option) => (
						<div
							key={option.value}
							onClick={() => handleChange(option.value)}
							className={`flex h-8 cursor-pointer items-center px-4 text-sm transition-colors hover:bg-secondary ${value === option.value ? "text-foreground font-medium" : "text-muted-foreground"}`}
						>
							{option.label}
						</div>
					))}
				</PopoverContent>
			</Popover>
		</div>
	);
};
