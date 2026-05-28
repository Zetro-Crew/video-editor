import path from "node:path";
import { fileURLToPath } from "node:url";

const WATERMARK_LOGO_ASSET_PATH = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../../assets/watermarklogo.png",
);

const BOX_H = 70;
const PADDING = 10;

export const prepareWatermarkLogo = async (): Promise<string> => {
	return WATERMARK_LOGO_ASSET_PATH;
};

export const buildWatermarkFilterParts = (
	currentStream: string,
	logoInputIndex: number,
	outputLabel: string,
): string[] => {
	return [
		`[${logoInputIndex}:v]loop=loop=-1:size=1:start=0[wm_loop]`,
		`[wm_loop]scale=h=${BOX_H}:w=-1:force_original_aspect_ratio=decrease[wm_scaled]`,
		`${currentStream}[wm_scaled]overlay=x=W-overlay_w-${PADDING}:y=${PADDING}:shortest=1[${outputLabel}]`,
	];
};
