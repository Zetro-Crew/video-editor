import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { FileIcon, UploadIcon, X } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import useUploadStore from "@/features/editor/store/use-upload-store";
import { useObjectUrl } from "@/hooks/use-object-url";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { ScrollArea } from "./ui/scroll-area";

type ModalUploadProps = {
	type?: string;
};

const extractVideoThumbnail = (file: File) => {
	return new Promise<string>((resolve) => {
		const video = document.createElement("video");
		const objectUrl = URL.createObjectURL(file);
		const cleanup = () => {
			video.pause();
			video.removeAttribute("src");
			video.load();
			URL.revokeObjectURL(objectUrl);
		};

		video.src = objectUrl;
		video.currentTime = 1;
		video.muted = true;
		video.playsInline = true;
		video.onloadeddata = () => {
			const canvas = document.createElement("canvas");
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
			const ctx = canvas.getContext("2d");
			ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
			cleanup();
			resolve(canvas.toDataURL("image/png"));
		};
		video.onerror = () => {
			cleanup();
			resolve("");
		};
	});
};

const UploadImagePreview = ({ file }: { file: File }) => {
	const objectUrl = useObjectUrl(file);

	if (!objectUrl) {
		return <div className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 rounded border bg-muted" />;
	}

	return (
		<img
			src={objectUrl}
			alt={file.name}
			className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 object-cover rounded border"
		/>
	);
};

const ModalUpload: React.FC<ModalUploadProps> = ({ type = "all" }) => {
	const {
		setShowUploadModal,
		showUploadModal,
		setFiles,
		files,
		addPendingUploads,
		processUploads,
	} = useUploadStore();
	const [videoThumbnails, setVideoThumbnails] = useState<{
		[name: string]: string;
	}>({});
	const [isDragOver, setIsDragOver] = useState(false);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const triggerFileInput = () => {
		fileInputRef.current?.click();
	};

	const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		if (!e.target.files?.length) return;

		const selectedFiles = Array.from(e.target.files);

		const newFiles = selectedFiles
			.filter((f) => !files.some((fileObj) => fileObj.file?.name === f.name))
			.map((f) => ({ id: crypto.randomUUID(), file: f }));

		if (newFiles.length === 0) return;

		setFiles((prev) => [...newFiles, ...prev]);

		const videoThumbnailsData = await Promise.all(
			newFiles
				.filter((f) => f.file?.type.startsWith("video/"))
				.map(async (f) => ({
					name: f.file?.name ?? "",
					thumb: f.file ? await extractVideoThumbnail(f.file) : "",
				})),
		);
		setVideoThumbnails((prev) => ({
			...prev,
			...Object.fromEntries(videoThumbnailsData.map((v) => [v.name, v.thumb])),
		}));
	};

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(true);
	};

	const handleDragLeave = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(false);
	};

	const handleDrop = async (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(false);

		if (e.dataTransfer.files) {
			const newFiles = Array.from(e.dataTransfer.files)
				.filter((f) => !files.some((fileObj) => fileObj.file?.name === f.name))
				.map((f) => ({ id: crypto.randomUUID(), file: f }));
			if (newFiles.length === 0) return;

			setFiles((prev) => [...newFiles, ...prev]);
			const videoThumbnailsData = await Promise.all(
				newFiles
					.filter((f) => f.file?.type.startsWith("video/"))
					.map(async (f) => ({
						name: f.file?.name ?? "",
						thumb: f.file ? await extractVideoThumbnail(f.file) : "",
					})),
			);
			setVideoThumbnails((prev) => ({
				...prev,
				...Object.fromEntries(videoThumbnailsData.map((v) => [v.name, v.thumb])),
			}));
		}
	};

	const handleRemoveFile = (id: string) => {
		setFiles(files.filter((f) => f.id !== id));
	};

	const handleUpload = async () => {
		const fileUploads = files
			.filter((f) => f.file?.type)
			.map((f) => ({
				id: f.id,
				file: f.file,
				type: f.file?.type,
				status: "pending" as const,
				progress: 0,
			}));

		addPendingUploads(fileUploads);

		setTimeout(() => {
			processUploads();
			setFiles([]);
			setShowUploadModal(false);
		}, 0);
	};
	const getAcceptType = () => {
		switch (type) {
			case "audio":
				return "audio/*";
			case "image":
				return "image/*";
			case "video":
				return "video/*";
			default:
				return "audio/*,image/*,video/*";
		}
	};
	useEffect(() => {
		setFiles([]);
		setVideoThumbnails({});
	}, [showUploadModal, setFiles]);

	return (
		<div>
			<Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle className="text-md">העלה מדיה</DialogTitle>
					</DialogHeader>
					<div className="space-y-6">
						<label className="flex flex-col gap-2">
							<input
								type="file"
								accept={getAcceptType()}
								onChange={handleFileChange}
								multiple
								ref={fileInputRef}
								style={{ display: "none" }}
								aria-label="בחר קבצי מדיה"
							/>

							<div
								className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
									isDragOver
										? "border-primary bg-primary/10"
										: "border border-border hover:border-muted-foreground/50"
								}`}
								onDragOver={handleDragOver}
								onDragLeave={handleDragLeave}
								onDrop={handleDrop}
							>
								<UploadIcon className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
								<p className="text-sm text-muted-foreground mb-2">גרור ושחרר קבצים לכאן, או</p>
								<Button onClick={triggerFileInput} variant="outline" size="sm">
									עיין בקבצים
								</Button>
							</div>
						</label>

						{files.length > 0 && (
							<div className="flex flex-col gap-2 mt-2">
								<span className="text-xs text-muted-foreground">קבצים נבחרים:</span>
								<ScrollArea className="max-h-48">
									<AnimatePresence initial={false}>
										<div className="flex flex-col gap-2">
											{files.map((file) => (
												<motion.div
													key={file.id}
													className="relative flex flex-col items-center p-1.5 sm:p-2 border rounded shadow-sm w-full"
													initial={{ opacity: 0, scale: 0.8 }}
													animate={{ opacity: 1, scale: 1 }}
													exit={{ opacity: 0, scale: 0.8 }}
													transition={{
														type: "spring",
														stiffness: 300,
														damping: 30,
													}}
													layout
												>
													<div className="w-full flex justify-between items-center">
														<div className="flex flex-1 gap-1 sm:gap-1.5 md:gap-2  items-center">
															<div className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 flex items-center justify-center">
																{file.file?.type.startsWith("image/") ? (
																	<UploadImagePreview file={file.file} />
																) : file.file?.type.startsWith("video/") &&
																	videoThumbnails[file.file.name] ? (
																	<img
																		src={videoThumbnails[file.file.name]}
																		alt={`${file.file.name} thumbnail`}
																		className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 object-cover rounded border"
																	/>
																) : (
																	<div className="h-5 w-5 sm:h-6 md:h-8 md:w-8 flex items-center justify-center rounded border bg-muted">
																		<FileIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3 md:h-4 md:w-4 text-foreground" />
																	</div>
																)}
															</div>

															<div>
																<div
																	className="w-full truncate text-xs text-muted-foreground max-w-80"
																	title={file.file?.name ?? ""}
																>
																	{file.file?.name ?? ""}
																</div>
																<div className={clsx("text-[9px] sm:text-[10px] text-gray-400")}>
																	{file.file ? `${(file.file.size / 1024).toFixed(2)} KB` : ""}
																</div>
															</div>
														</div>
														<Button
															variant={"outline"}
															onClick={() => handleRemoveFile(file.id)}
															size={"icon"}
															className="cursor-pointer"
														>
															<X className="h-4 w-4" />
														</Button>
													</div>
												</motion.div>
											))}
										</div>
									</AnimatePresence>
								</ScrollArea>
							</div>
						)}
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setShowUploadModal(false)}>
							ביטול
						</Button>
						<Button onClick={handleUpload} disabled={files.length === 0}>
							העלה
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
};

export default ModalUpload;
