export const download = (url: string, filename: string) => {
	const link = document.createElement("a");
	link.href = url;
	link.setAttribute("download", filename);
	link.setAttribute("target", "_blank");
	link.setAttribute("rel", "noopener noreferrer");
	document.body.appendChild(link);
	link.click();
	link.parentNode?.removeChild(link);
};

export type ExportDownloadType = "json" | "mp4" | "webp";

export const getExportFilename = (type: ExportDownloadType, baseName = "untitled") =>
	`${baseName}.${type}`;
