import { Control, controlsUtils, resize } from "@designcombo/timeline";
import { drawVerticalLeftIcon, drawVerticalRightIcon } from "./draw";

const { scaleSkewCursorStyleHandler } = controlsUtils;

export const createResizeControls = () => ({
	mr: new Control({
		x: 0.5,
		y: 0,
		render: drawVerticalRightIcon,
		actionHandler: resize.common,
		cursorStyleHandler: scaleSkewCursorStyleHandler,
		actionName: "resizing",
		sizeX: 20,
		sizeY: 32,
		offsetX: 10,
	}),
	ml: new Control({
		x: -0.5,
		y: 0,
		actionHandler: resize.common,
		cursorStyleHandler: scaleSkewCursorStyleHandler,
		actionName: "resizing",
		render: drawVerticalLeftIcon,
		sizeX: 20,
		sizeY: 32,
		offsetX: -10,
	}),
});

export const createAudioControls = () => ({
	mr: new Control({
		x: 0.5,
		y: 0,
		render: drawVerticalRightIcon,
		actionHandler: resize.audio,
		cursorStyleHandler: scaleSkewCursorStyleHandler,
		actionName: "resizing",
		sizeX: 20,
		sizeY: 32,
		offsetX: 10,
	}),
	ml: new Control({
		x: -0.5,
		y: 0,
		render: drawVerticalLeftIcon,
		actionHandler: resize.audio,
		cursorStyleHandler: scaleSkewCursorStyleHandler,
		actionName: "resizing",
		sizeX: 20,
		sizeY: 32,
		offsetX: -10,
	}),
});

export const createMediaControls = () => ({
	mr: new Control({
		x: 0.5,
		y: 0,
		actionHandler: resize.media,
		render: drawVerticalRightIcon,
		cursorStyleHandler: scaleSkewCursorStyleHandler,
		actionName: "resizing",
		sizeX: 20,
		sizeY: 32,
		offsetX: 10,
	}),
	ml: new Control({
		x: -0.5,
		y: 0,
		render: drawVerticalLeftIcon,

		actionHandler: resize.media,
		cursorStyleHandler: scaleSkewCursorStyleHandler,
		actionName: "resizing",
		sizeX: 20,
		sizeY: 32,
		offsetX: -10,
	}),
});
