export const FFMPEG_COMMAND = {
	HIDE_BANNER: "-hide_banner",
	OVERWRITE_OUTPUT: "-y",
	AVOID_NEGATIVE_TIMESTAMPS: ["-avoid_negative_ts", "make_zero"],
	// keep the frame rate constant - The video plays with the same number of frames every second from start to end
	CONSTANT_FRAME_RATE: ["-vsync", "cfr"],
	COPY: ["-c", "copy"],
	// tell FFmpeg to use the audio stream from the input explicitly
	EXPLICIT_AUDIO_STREAM: "0:a:0",
	EXPLICIT_VIDEO_STREAM: "0:v:0",
	// tells FFmpeg to encode audio using the AAC codec
	AAC_AUDIO_CODEC: "aac",
	// Encode the audio at 192 kilobits per second (kbps).
	AUDIO_BITRATE: "192k",
	AUDIO_FREQUENCY: 44100,
	// encode the video using the H.264 standard
	H264_VIDEO_CODEC: "libx264",
	FORMAT_YUV420P: "format=yuv420p",
	EVEN_DIMENSIONS: "scale=trunc(iw/2)*2:trunc(ih/2)*2",
	// Move the MP4 metadata to the beginning of the file so video can start playing before it fully downloads
	MOVE_METADATA_TO_BEGINNING: ["-movflags", "+faststart"],
	ALLOW_MULTIPLE_PATHS: ["-safe", "0"],
	CONCAT_FORMAT: ["-f", "concat"],
	CONCAT_SAFE_0: ["-f", "concat", "-safe", "0"],
	// Fragmented MP4 for pipe output — +faststart is incompatible with pipe:1 (requires seeking), use +default_base_moof instead
	MOVFLAGS_FRAG_FASTSTART: ["-movflags", "+frag_keyframe+empty_moov+default_base_moof"],
	// Generate missing or broken presentation timestamps (PTS) for the input stream.
	GENERATE_MISSING_PTS: ["-fflags", "+genpts"],
	// Treat the input as a libavfilter input, not as file. use this when need to generate silent audio
	TREAT_AS_LIBAV_FILTER: ["-f", "lavfi"],
	// Generate a silent audio stream with the specified channel layout and sample rate.
	NULL_AUDIO_STREAM: ["anullsrc=channel_layout=stereo:sample_rate=44100"],
	LOOP_INDEFINITE: ["-loop", "1"],
	// Output the shortest input stream.
	OUTPUT_SHORTEST_STREAM: ["-shortest"],
} as const;

// Individual FFmpeg flags for direct argv construction
export const FFMPEG_FLAG = {
	INPUT: "-i",
	// Seek before input for fast keyframe-level seeking (vs. slow stream-level seek after -i)
	SEEK_INPUT: "-ss",
	DURATION: "-t",
	FRAME_RATE: "-r",
	VIDEO_FILTER: "-vf",
	AUDIO_FILTER: "-af",
	VIDEO_CODEC: "-c:v",
	AUDIO_CODEC: "-c:a",
	AUDIO_BITRATE: "-b:a",
	AUDIO_SAMPLE_RATE: "-ar",
	AUDIO_CHANNELS: "-ac",
	NO_AUDIO: "-an",
	NO_VIDEO: "-vn",
	FORMAT: "-f",
	COMPLEX_FILTER: "-filter_complex",
	MAP: "-map",
	ENCODING_PRESET: "-preset",
	// Constant rate factor (quality)
	CRF: "-crf",
	PIXEL_FORMAT: "-pix_fmt",
	// DASH packaging: comma-separated adaptation set definitions
	ADAPTATION_SETS: "-adaptation_sets",
	// DASH segment duration in seconds
	SEGMENT_DURATION: "-seg_duration",
	USE_TEMPLATE: "-use_template",
	USE_TIMELINE: "-use_timeline",
	// Copy streams without re-encoding (use with codec name, e.g. -c copy)
	STREAM_COPY: "-c",
	// Terminate output when the shortest input ends
	SHORTEST: "-shortest",
	SINGLE_FRAME: ["-frames:v", "1"],
	// Write encoded output to stdout (for piping)
	PIPE_OUTPUT: "pipe:1",
} as const;
