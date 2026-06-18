import { Loader2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Droppable } from "@/components/ui/droppable";
import useUploadStore from "../store/use-upload-store";
import { DroppableArea } from "./droppable";

interface SceneEmptyProps {
	playerWidth: number;
	playerHeight: number;
}

const SceneEmpty = ({ playerWidth, playerHeight }: SceneEmptyProps) => {
	const [isLoading, setIsLoading] = useState(true);
	const containerRef = useRef<HTMLDivElement>(null);
	const [isDraggingOver, setIsDraggingOver] = useState(false);
	const { addPendingUploads, processUploads } = useUploadStore();

	useEffect(() => {
		setIsLoading(false);
	}, []);

	const onSelectFiles = (files: File[]) => {
		const fileUploads = files.map((f) => ({
			id: crypto.randomUUID(),
			file: f,
			type: f.type,
			status: "pending" as const,
			progress: 0,
		}));

		addPendingUploads(fileUploads);
		setTimeout(() => {
			processUploads();
		}, 0);
	};

	return (
		<div
			ref={containerRef}
			className="absolute z-50 flex h-full w-full flex-1 items-center justify-center pointer-events-none"
		>
			{!isLoading ? (
				<Droppable
					maxFileCount={10}
					maxSize={50 * 1024 * 1024}
					accept={{
						"video/*": [],
						"image/*": [],
						"audio/*": [],
					}}
					disabled={false}
					onValueChange={onSelectFiles}
					className="pointer-events-auto"
					style={{ width: playerWidth, height: playerHeight }}
				>
					<DroppableArea
						onDragStateChange={setIsDraggingOver}
						className={`h-full w-full flex items-center justify-center border border-dashed text-center transition-colors duration-200 ease-in-out ${
							isDraggingOver ? "border-border bg-white/10" : "border-transparent"
						}`}
					>
						<div className="flex flex-col items-center justify-center gap-4 pb-12">
							<div className="hover:bg-primary-dark cursor-pointer rounded-md border border-dashed p-2 text-foreground transition-colors duration-200">
								<Upload className="h-14 w-14" aria-hidden="true" />
							</div>
							<div className="flex flex-col gap-px">
								<p className="text-2xl">לחץ להעלאה</p>
								<p className="text-lg text-muted-foreground/70">או גרור ושחרר קבצים לכאן</p>
							</div>
						</div>
					</DroppableArea>
				</Droppable>
			) : (
				<div className="fixed top-0 left-0 z-50 flex h-screen w-screen flex-col items-center justify-center gap-4 bg-card">
					<Loader2 className="h-8 w-8 animate-spin text-primary" />
					<p className="text-sm text-muted-foreground">טוען...</p>
				</div>
			)}
		</div>
	);
};

export default SceneEmpty;
