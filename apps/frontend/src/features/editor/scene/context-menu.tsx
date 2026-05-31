import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface SceneContextMenuProps {
	x: number;
	y: number;
	onClose: () => void;
	onDelete: () => void;
	onDuplicate: () => void;
	onEditProperties: () => void;
}

export function SceneContextMenu({
	x,
	y,
	onClose,
	onDelete,
	onDuplicate,
	onEditProperties,
}: SceneContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleOutsideClick = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("mousedown", handleOutsideClick);
		document.addEventListener("keydown", handleEscape);
		return () => {
			document.removeEventListener("mousedown", handleOutsideClick);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [onClose]);

	return createPortal(
		<div
			ref={menuRef}
			style={{ top: y, left: x }}
			className="fixed z-[200] min-w-40 rounded-lg border border-border/80 bg-card py-1 shadow-xl"
			onContextMenu={(e) => e.preventDefault()}
		>
			<button
				type="button"
				className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-secondary"
				onClick={onEditProperties}
			>
				עריכת מאפיינים
			</button>
			<button
				type="button"
				className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-secondary"
				onClick={onDuplicate}
			>
				שכפל
			</button>
			<div className="my-1 border-t border-border/60" />
			<button
				type="button"
				className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-secondary"
				onClick={onDelete}
			>
				מחק
			</button>
		</div>,
		document.body,
	);
}
