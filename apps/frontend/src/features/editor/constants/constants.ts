export const PREVIEW_FRAME_WIDTH = 188;
const DEFAULT_FRAMERATE = 60;
export const FRAME_INTERVAL = 1000 / DEFAULT_FRAMERATE;
export const TIMELINE_OFFSET_CANVAS_LEFT = 16;
export const TIMELINE_OFFSET_CANVAS_RIGHT = 80;
export const SECONDARY_FONT_URL = "/fonts/Geist-SemiBold.ttf";
export const SECONDARY_FONT = "geist-regular";

export const SMALL_FONT_SIZE = 12;

// Dynamic timeline offset values
export const TIMELINE_OFFSET_X_SMALL = 8;
export const TIMELINE_OFFSET_X_LARGE = 40;

// Sentinel for "append as a new track at the end". The state manager clamps any index >= tracks.length.
export const TRACK_APPEND_INDEX = 99999;
