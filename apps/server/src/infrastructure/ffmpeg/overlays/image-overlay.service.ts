import { access } from "node:fs/promises";
import path from "node:path";
import type { ImageOverlay } from "../../../shared/domain/render-types.ts";
import { downloadFile } from "../../../shared/utils/file.utils.ts";
import { convertWebpToPng, getImageExtension } from "../source-processors/image-process.ts";
import { buildEnableExpression, buildPositionExpression } from "./overlay-utils.ts";

export const prepareImageOverlay = async (
	overlay: ImageOverlay,
	tempDir: string,
): Promise<string> => {
	const originalExt = getImageExtension(overlay.imageUrl);
	const imagePath = path.join(tempDir, `overlay-${overlay.id}.${originalExt}`);
	await downloadFile(overlay.imageUrl, imagePath);

	const finalImagePath: string =
		originalExt === "webp" ? await convertWebpToPng(imagePath) : imagePath;

	await access(finalImagePath);
	return finalImagePath;
};

export const buildImageOverlayFilter = (
	overlay: ImageOverlay,
	imageInputIndex: number,
	currentStream: string,
	outputLabel: string,
	videoDuration: number,
): string => {
	const widthPixels = overlay.width ?? 200;
	const heightPixels = overlay.height ?? 200;
	const x = buildPositionExpression(overlay.x, "x");
	const y = buildPositionExpression(overlay.y, "y");
	const enable = buildEnableExpression(overlay.start, overlay.end);
	const imgInput = `[${imageInputIndex}:v]`;
	const loopedImgLabel = `looped${imageInputIndex}`;
	const scaledImgLabel = `scaled${imageInputIndex}`;
	const MAX_LOOP_BUFFER_FRAMES = 300;
	const loopSize = Math.min(Math.ceil(videoDuration * 30), MAX_LOOP_BUFFER_FRAMES);

	return `${imgInput}loop=loop=-1:size=${loopSize}:start=0[${loopedImgLabel}];[${loopedImgLabel}]scale=w=${widthPixels}:h=${heightPixels}:force_original_aspect_ratio=decrease[${scaledImgLabel}];${currentStream}[${scaledImgLabel}]overlay=${x}:${y}:enable='${enable}'[${outputLabel}]`;
};
