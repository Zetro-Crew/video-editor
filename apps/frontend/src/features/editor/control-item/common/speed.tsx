import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

const Speed = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => {
	// Create local state to manage opacity
	const [localValue, setLocalValue] = useState<string | number>(value);

	// Update local state when prop value changes
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
			<span className="text-xs text-muted-foreground">מהירות</span>
			<div className="flex items-center gap-2">
				<Slider
					id="speed"
					value={[Number(localValue)]}
					onValueChange={(e) => setLocalValue(e[0])}
					onValueCommit={() => onChange(Number(localValue))}
					min={0}
					max={4}
					step={0.1}
					aria-label="Speed"
					className="flex-1"
				/>
				<Input
					className="h-8 w-14 px-2 text-center text-sm"
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
		</div>
	);
};

export default Speed;
