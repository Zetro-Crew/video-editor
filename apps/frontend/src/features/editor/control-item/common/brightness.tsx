import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

const Brightness = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => {
	// Create local state to manage opacity
	const [localValue, setLocalValue] = useState(value);

	// Update local state when prop value changes
	useEffect(() => {
		setLocalValue(value);
	}, [value]);

	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs text-muted-foreground">בהירות</span>
			<div className="flex items-center gap-2">
				<Slider
					id="brightness"
					value={[localValue]}
					onValueChange={(e) => setLocalValue(e[0])}
					onValueCommit={() => onChange(localValue)}
					min={0}
					max={100}
					step={1}
					aria-label="Brightness"
					className="flex-1"
				/>
				<Input
					max={100}
					className="h-8 w-14 px-2 text-center text-sm"
					type="number"
					onChange={(e) => {
						const newValue = Number(e.target.value);
						if (newValue >= 0 && newValue <= 100) {
							setLocalValue(newValue);
							onChange(newValue);
						}
					}}
					value={localValue}
				/>
			</div>
		</div>
	);
};

export default Brightness;
