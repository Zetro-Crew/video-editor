import { promises as fsp } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFontFileParameter, prepareRTLText } from "../../../shared/utils/font.utils.ts";
import { convertWebpToPng } from "../source-processors/image-process.ts";
import { escapeTextForFFmpeg } from "./overlay-utils.ts";

const WATERMARK_LOGO_ASSET_PATH = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../../assets/ztubeLogo.webp",
);

const LOGO_H = 36;
const BOX_W = 180;
const BOX_H = 50;
const PADDING = 10;
const FONT_SIZE = 16;
const WATERMARK_TEXT = "נערך ב-";

export const prepareWatermarkLogo = async (tempDir: string): Promise<string> => {
	const destWebp = path.join(tempDir, "watermark-logo.webp");
	await fsp.copyFile(WATERMARK_LOGO_ASSET_PATH, destWebp);
	return convertWebpToPng(destWebp);
};

export const buildWatermarkFilterParts = (
	currentStream: string,
	logoInputIndex: number,
	outputLabel: string,
): string[] => {
	const fontParam = getFontFileParameter();
	const preparedText = prepareRTLText(WATERMARK_TEXT);
	const escapedText = escapeTextForFFmpeg(preparedText);

	return [
		`[${logoInputIndex}:v]loop=loop=-1:size=1:start=0[wm_loop]`,
		`[wm_loop]scale=h=${LOGO_H}:w=-1:force_original_aspect_ratio=decrease[wm_scaled]`,
		`${currentStream}drawbox=x=iw-${BOX_W + PADDING}:y=${PADDING}:w=${BOX_W}:h=${BOX_H}:color=black@0.45:t=fill[wm_boxed]`,
		`[wm_boxed][wm_scaled]overlay=x=W-overlay_w-${PADDING}:y=${PADDING}+(${BOX_H}-overlay_h)/2:shortest=1[wm_logo]`,
		`[wm_logo]drawtext=${fontParam}:text='${escapedText}':fontsize=${FONT_SIZE}:fontcolor=white:x=W-${BOX_W + PADDING}+5:y=${PADDING}+(${BOX_H}-text_h)/2[${outputLabel}]`,
	];
};
