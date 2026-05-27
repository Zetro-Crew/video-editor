import { dispatch } from "@designcombo/events";
import { ADD_AUDIO, ADD_IMAGE, ADD_VIDEO } from "@designcombo/state";
import { generateId } from "@designcombo/timeline";
import {
	Image as ImageIcon,
	Loader2,
	Music,
	Upload,
	UploadIcon,
	Video as VideoIcon,
} from "lucide-react";
import React from "react";
import { toast } from "sonner";
import ModalUpload from "@/components/modal-upload";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import useUploadStore from "../store/use-upload-store";
import { getMediaDurationMs, getUploadAssetUrl } from "../utils/upload-media";

const MAX_UPLOAD_LABEL_LENGTH = 16;

const formatUploadLabel = (value: string, fallback: string) => {
	const normalized = value
		.replace(/\.[^/.]+$/, "")
		.replace(/[_-]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();

	const displayName = normalized || fallback;
	if (displayName.length <= MAX_UPLOAD_LABEL_LENGTH) {
		return displayName;
	}

	return `${displayName.slice(0, MAX_UPLOAD_LABEL_LENGTH).trimEnd()}...`;
};

const getUploadLabel = (upload: any, fallback: string) =>
	formatUploadLabel(upload.fileName || upload.file?.name || "", fallback);

const UploadPreview = ({ upload, kind }: { upload: any; kind: "image" | "video" }) => {
	const src = getUploadAssetUrl(upload);
	const [isVideoReady, setIsVideoReady] = React.useState(false);

	React.useEffect(() => {
		setIsVideoReady(false);
	}, [src]);

	if (!src) {
		return (
			<div className="flex h-full w-full items-center justify-center bg-muted/30">
				{kind === "image" ? (
					<ImageIcon className="h-8 w-8 text-muted-foreground" />
				) : (
					<VideoIcon className="h-8 w-8 text-muted-foreground" />
				)}
			</div>
		);
	}

	if (kind === "image") {
		return (
			<img
				src={src}
				alt={getUploadLabel(upload, "Image")}
				className="h-full w-full object-cover"
				draggable={false}
				loading="lazy"
				width={80}
				height={80}
			/>
		);
	}

	return (
		<div className="relative h-full w-full bg-muted/30">
			{!isVideoReady && (
				<div className="absolute inset-0 flex items-center justify-center">
					<VideoIcon className="h-8 w-8 text-muted-foreground" />
				</div>
			)}
			<video
				src={src}
				className={`h-full w-full object-cover transition-opacity ${
					isVideoReady ? "opacity-100" : "opacity-0"
				}`}
				muted
				playsInline
				preload="metadata"
				width={80}
				height={80}
				onLoadedData={() => setIsVideoReady(true)}
				onCanPlay={() => setIsVideoReady(true)}
				onError={() => setIsVideoReady(false)}
			/>
		</div>
	);
};

export const Uploads = () => {
	const { setShowUploadModal, uploads, pendingUploads, activeUploads } = useUploadStore();

	// Group completed uploads by type
	const videos = uploads.filter(
		(upload) => upload.type?.startsWith("video/") || upload.type === "video",
	);
	const images = uploads.filter(
		(upload) => upload.type?.startsWith("image/") || upload.type === "image",
	);
	const audios = uploads.filter(
		(upload) => upload.type?.startsWith("audio/") || upload.type === "audio",
	);

	const handleAddVideo = async (video: any) => {
		const src = getUploadAssetUrl(video);
		const durationMs = await getMediaDurationMs(src, "video");
		if (!durationMs) {
			toast.error("Could not determine video duration. Re-upload the file.");
			return;
		}
		dispatch(ADD_VIDEO, {
			payload: {
				id: generateId(),
				type: "video",
				display: { from: 0, to: durationMs },
				trim: { from: 0, to: durationMs },
				duration: durationMs,
				details: { src },
				metadata: { previewUrl: "" },
			},
			options: {
				resourceId: "main",
				scaleMode: "fit",
			},
		});
	};

	const handleAddImage = (image: any) => {
		const srcImage = getUploadAssetUrl(image);

		dispatch(ADD_IMAGE, {
			payload: {
				id: generateId(),
				type: "image",
				display: {
					from: 0,
					to: 5000,
				},
				details: {
					src: srcImage,
				},
				metadata: {},
			},
			options: {},
		});
	};

	const handleAddAudio = async (audio: any) => {
		const src = getUploadAssetUrl(audio);
		const durationMs = await getMediaDurationMs(src, "audio");
		if (!durationMs) {
			toast.error("Could not determine audio duration. Re-upload the file.");
			return;
		}
		dispatch(ADD_AUDIO, {
			payload: {
				id: generateId(),
				type: "audio",
				display: { from: 0, to: durationMs },
				trim: { from: 0, to: durationMs },
				duration: durationMs,
				details: { src },
				metadata: {},
			},
			options: {},
		});
	};

	const UploadPrompt = () => (
		<div className="flex items-center justify-center p-4">
			<Button
				className="w-full cursor-pointer"
				onClick={() => setShowUploadModal(true)}
				variant={"outline"}
			>
				<UploadIcon className="w-4 h-4" />
				<span className="ml-2">העלה</span>
			</Button>
		</div>
	);

	const noUploads =
		pendingUploads.length === 0 &&
		activeUploads.length === 0 &&
		videos.length === 0 &&
		images.length === 0 &&
		audios.length === 0;
	return (
		<div className="flex flex-1 flex-col">
			<ModalUpload />
			<UploadPrompt />

			{noUploads && (
				<div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
					<Upload size={32} className="opacity-50" />
					<span className="text-sm">
						{uploads.length === 0 ? "עדיין אין העלאות" : "לא נמצאו תוצאות"}
					</span>
				</div>
			)}

			{/* Uploads in Progress Section */}
			{(pendingUploads.length > 0 || activeUploads.length > 0) && (
				<div className="p-4">
					<div className="font-medium text-sm mb-2 flex items-center gap-2">
						<Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
						העלאות בתהליך
					</div>
					<div className="flex flex-col gap-2">
						{pendingUploads.map((upload) => (
							<div key={upload.id} className="flex items-center gap-2">
								<span className="truncate text-xs flex-1">{getUploadLabel(upload, "Unknown")}</span>
								<span className="text-xs text-muted-foreground">ממתין</span>
							</div>
						))}
						{activeUploads.map((upload) => (
							<div key={upload.id} className="flex items-center gap-2">
								<span className="truncate text-xs flex-1">{getUploadLabel(upload, "Unknown")}</span>
								<div className="flex items-center gap-1">
									<Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
									<span className="text-xs">{upload.progress ?? 0}%</span>
									<span className="text-xs text-muted-foreground ml-2">{upload.status}</span>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			<div className="flex flex-col gap-10 p-4">
				{/* Videos Section */}
				{videos.length > 0 && (
					<div>
						<div className="flex items-center gap-2 mb-2">
							<VideoIcon className="w-4 h-4 text-muted-foreground" />
							<span className="font-medium text-sm">סרטונים</span>
						</div>
						<ScrollArea className="h-52">
							<div className="grid grid-cols-3 gap-2 max-w-full">
								{videos.map((video, idx) => (
									<div className="flex w-full flex-col items-center gap-2" key={video.id || idx}>
										<Card
											className="w-16 h-16 flex items-center justify-center overflow-hidden relative cursor-pointer"
											onClick={() => handleAddVideo(video)}
										>
											<UploadPreview upload={video} kind="video" />
										</Card>
										<div
											className="w-full truncate text-center text-xs text-muted-foreground"
											title={getUploadLabel(video, "Video")}
										>
											{getUploadLabel(video, "Video")}
										</div>
									</div>
								))}
							</div>
						</ScrollArea>
					</div>
				)}

				{/* Images Section */}
				{images.length > 0 && (
					<div>
						<div className="flex items-center gap-2 mb-2">
							<ImageIcon className="w-4 h-4 text-muted-foreground" />
							<span className="font-medium text-sm">תמונות</span>
						</div>
						<ScrollArea className="h-52">
							<div className="grid grid-cols-3 gap-2 max-w-full">
								{images.map((image, idx) => (
									<div className="flex w-full flex-col items-center gap-2" key={image.id || idx}>
										<Card
											className="w-16 h-16 flex items-center justify-center overflow-hidden relative cursor-pointer"
											onClick={() => handleAddImage(image)}
										>
											<UploadPreview upload={image} kind="image" />
										</Card>
										<div
											className="w-full truncate text-center text-xs text-muted-foreground"
											title={getUploadLabel(image, "Image")}
										>
											{getUploadLabel(image, "Image")}
										</div>
									</div>
								))}
							</div>
						</ScrollArea>
					</div>
				)}

				{/* Audios Section */}
				{audios.length > 0 && (
					<div>
						<div className="flex items-center gap-2 mb-2">
							<Music className="w-4 h-4 text-muted-foreground" />
							<span className="font-medium text-sm">קטעי שמע</span>
						</div>
						<ScrollArea className="h-52">
							<div className="grid grid-cols-3 gap-2 max-w-full">
								{audios.map((audio, idx) => (
									<div className="flex w-full flex-col items-center gap-2" key={audio.id || idx}>
										<Card
											className="w-16 h-16 flex items-center justify-center overflow-hidden relative cursor-pointer"
											onClick={() => handleAddAudio(audio)}
										>
											<Music className="w-8 h-8 text-muted-foreground" />
										</Card>
										<div
											className="w-full truncate text-center text-xs text-muted-foreground"
											title={getUploadLabel(audio, "Audio")}
										>
											{getUploadLabel(audio, "Audio")}
										</div>
									</div>
								))}
							</div>
						</ScrollArea>
					</div>
				)}
			</div>
		</div>
	);
};
