import { spawn } from "node:child_process";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { Logger } from "@ztube/observability";
import ffprobeStatic from "ffprobe-static";
import type { VideoMetadata } from "../../shared/domain/VideoMetadata.ts";

const FFPROBE_QUIET = "-v";
const FFPROBE_QUIET_LEVEL = "quiet";
const FFPROBE_JSON_FORMAT = "-print_format";
const FFPROBE_JSON = "json";
const FFPROBE_SHOW_STREAMS = "-show_streams";
const FFPROBE_SHOW_FORMAT = "-show_format";
const AUDIO_CODEC_TYPE = "audio";

class Semaphore {
	private running = 0;
	private readonly queue: (() => void)[] = [];
	private readonly max: number;

	constructor(max: number) {
		this.max = max;
	}

	acquire(): Promise<void> {
		if (this.running < this.max) {
			this.running++;
			return Promise.resolve();
		}
		return new Promise<void>((resolve) => this.queue.push(resolve));
	}

	release(): void {
		this.running--;
		const next = this.queue.shift();
		if (next) {
			this.running++;
			next();
		}
	}
}

const FFMPEG_MAX_CONCURRENT = Number(process.env.FFMPEG_MAX_CONCURRENT) || 2;
export const ffmpegSemaphore = new Semaphore(FFMPEG_MAX_CONCURRENT);

export const getFfmpegPath = (): string => ffmpegInstaller.path;
const getFfprobePath = (): string => ffprobeStatic.path;

export const runFfmpeg = async (
	args: string[],
	timeoutMs = 0,
	signal?: AbortSignal,
): Promise<void> => {
	if (signal?.aborted) throw new Error("Render cancelled");
	await ffmpegSemaphore.acquire();
	if (signal?.aborted) {
		ffmpegSemaphore.release();
		throw new Error("Render cancelled");
	}
	try {
		await new Promise<void>((resolve, reject) => {
			const ffmpegPath = getFfmpegPath();
			Logger.logInfo("[ffmpeg] command", { executable: ffmpegPath, firstArg: args[0] });

			const proc = spawn(ffmpegPath, args);

			let stderrBuffer = "";
			const appendStderr = (chunk: Buffer): void => {
				stderrBuffer = `${stderrBuffer + chunk.toString()}\n`.slice(-32768);
			};
			proc.stderr.on("data", appendStderr);

			const state = { isTimedOut: false, isCancelled: false };

			const onAbort = (): void => {
				state.isCancelled = true;
				proc.kill("SIGKILL");
				reject(new Error("Render cancelled"));
			};
			signal?.addEventListener("abort", onAbort, { once: true });

			const timeoutHandle: NodeJS.Timeout | null =
				timeoutMs > 0
					? setTimeout(() => {
							state.isTimedOut = true;
							proc.kill("SIGKILL");
							reject(new Error(`FFmpeg transcode timed out after ${timeoutMs / 1000}s`));
						}, timeoutMs)
					: null;

			proc.on("close", (code) => {
				signal?.removeEventListener("abort", onAbort);
				if (timeoutHandle) clearTimeout(timeoutHandle);
				if (state.isTimedOut || state.isCancelled) return;
				if (code === 0) {
					resolve();
				} else {
					reject(
						new Error(
							stderrBuffer.trim().length > 0
								? `FFmpeg exited with code ${code}\n\nFFmpeg stderr (tail):\n${stderrBuffer}`
								: `FFmpeg exited with code ${code}`,
						),
					);
				}
			});

			proc.on("error", (err) => {
				signal?.removeEventListener("abort", onAbort);
				if (timeoutHandle) clearTimeout(timeoutHandle);
				if (!state.isTimedOut && !state.isCancelled) reject(err);
			});
		});
	} finally {
		ffmpegSemaphore.release();
	}
};

const spawnFfprobe = (url: string): Promise<string> =>
	new Promise((resolve, reject) => {
		const ffprobePath = getFfprobePath();
		const args = [
			FFPROBE_QUIET,
			FFPROBE_QUIET_LEVEL,
			FFPROBE_JSON_FORMAT,
			FFPROBE_JSON,
			FFPROBE_SHOW_STREAMS,
			FFPROBE_SHOW_FORMAT,
			url,
		];

		const proc = spawn(ffprobePath, args);

		let stdout = "";
		let stderr = "";
		proc.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		proc.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		proc.on("close", (code) => {
			if (code === 0) {
				resolve(stdout);
			} else {
				reject(new Error(`ffprobe failed: ${stderr.trim()}`));
			}
		});

		proc.on("error", (err) => {
			reject(new Error(`ffprobe spawn failed: ${err.message}`));
		});
	});

export const probeMpdMetadata = async (url: string): Promise<VideoMetadata> => {
	const raw = await spawnFfprobe(url);

	try {
		const metadata = JSON.parse(raw) as {
			format?: { duration?: string | number };
			streams?: { width?: number; height?: number }[];
		};

		const duration = Number.parseFloat(String(metadata.format?.duration ?? 0));
		const videoStream = metadata.streams?.find(
			(stream) => stream.width != null && stream.height != null,
		);
		const width = videoStream?.width ?? 0;
		const height = videoStream?.height ?? 0;

		return { duration, width, height };
	} catch (parseErr) {
		throw new Error(`Failed to parse ffprobe output: ${parseErr}`);
	}
};

export const hasAudioStream = async (videoPath: string): Promise<boolean> => {
	const raw = await spawnFfprobe(videoPath);

	try {
		const metadata = JSON.parse(raw) as {
			streams?: { codec_type?: string }[];
		};
		return !!metadata.streams?.some((stream) => stream.codec_type === AUDIO_CODEC_TYPE);
	} catch {
		return false;
	}
};
