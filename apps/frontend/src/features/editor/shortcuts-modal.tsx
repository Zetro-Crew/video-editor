import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { isMac } from "@/utils/platform";

interface ShortcutsModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

interface ShortcutItem {
	label: string;
	keys: string[];
}

interface ShortcutCategory {
	title: string;
	items: ShortcutItem[];
}

const mac = isMac();
const mod = mac ? "⌘" : "Ctrl";

const SHORTCUTS: ShortcutCategory[] = [
	{
		title: "כללי",
		items: [
			{ label: "בחר מספר קליפים", keys: ["Shift", "Left-Click"] },
			{ label: "העתק", keys: [mod, "C"] },
			{ label: "גזור", keys: [mod, "X"] },
			{ label: "הדבק", keys: [mod, "V"] },
			{ label: "מחק", keys: ["Del"] },
			{ label: "בטל", keys: [mod, "Z"] },
			{ label: "בצע שוב", keys: [mod, "Shift", "Z"] },
			{ label: "הפעל או השהה", keys: ["Space"] },
		],
	},
	{
		title: "ציר זמן",
		items: [
			{ label: "פצל", keys: [mod, "B"] },
			{ label: "הגדל", keys: [mod, "+"] },
			{ label: "הקטן", keys: [mod, "-"] },
			{ label: "פריים ראשון", keys: [mod, "←"] },
			{ label: "פריים הבא", keys: [mod, "→"] },
		],
	},
	{
		title: "קנבס",
		items: [
			{ label: "הזז למעלה פיקסל", keys: ["↑"] },
			{ label: "הזז למטה פיקסל", keys: ["↓"] },
			{ label: "הזז שמאלה פיקסל", keys: ["←"] },
			{ label: "הזז ימינה פיקסל", keys: ["→"] },
			{ label: "הזז 5 פיקסלים", keys: ["Shift", "Arrow Keys"] },
		],
	},
];

export function ShortcutsModal({ open, onOpenChange }: ShortcutsModalProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="md:max-w-5xl w-full max-w-5xl border bg-card p-6 py-8 overflow-hidden overscroll-y-contain">
				<DialogHeader className="px-6">
					<DialogTitle className="text-lg font-semibold text-wrap-balance">קיצורי דרך</DialogTitle>
				</DialogHeader>
				<div className="px-6">
					<div className="grid grid-cols-3 gap-8">
						{SHORTCUTS.map((category, index) => (
							<div key={category.title} className="flex flex-col gap-6 relative">
								<h3 className="text-sm font-semibold">{category.title}</h3>
								<div className="flex flex-col gap-5">
									{category.items.map((item) => (
										<div key={item.label} className="flex items-center justify-between text-sm">
											<span className="text-zinc-300">{item.label}</span>
											<div className="flex gap-5">
												{item.keys.map((key, i) => (
													<Kbd
														key={i}
														className="bg-zinc-800 border-zinc-700 text-zinc-300 min-w-6"
													>
														{key}
													</Kbd>
												))}
											</div>
										</div>
									))}
								</div>
								{index < SHORTCUTS.length - 1 && (
									<>
										<div className="md:hidden">
											<Separator className="my-4 bg-zinc-800" />
										</div>
										<div className="hidden md:block absolute -right-4 top-0 bottom-0 w-[1px] bg-zinc-800" />
									</>
								)}
							</div>
						))}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
