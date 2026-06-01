export interface CutRange {
	start: number;
	end: number;
}

export interface ExportEdits {
	cuts?: CutRange[];
}

export interface ExportOutput {
	format?: "mp4" | "dash";
}

export interface ChannelRangeSource {
	type: "channel-range";
	channelId: string;
	startTimeMs: number;
	endTimeMs: number;
}

export interface DirectSource {
	type: "direct";
	url: string;
	duration: number;
	trimFrom?: number;
	trimTo?: number;
}

export type ExportSource = ChannelRangeSource | DirectSource;

export interface EditorExportBody {
	source: ExportSource;
	edits?: ExportEdits;
	output?: ExportOutput;
}
