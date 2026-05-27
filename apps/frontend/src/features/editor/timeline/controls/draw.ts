import { type FabricObject, util } from "@designcombo/timeline";

export function drawVerticalLeftIcon(
	ctx: CanvasRenderingContext2D,
	left: number,
	top: number,
	_styleOverride: any,
	fabricObject: FabricObject,
) {
	const width = 10; // Rectangle width
	const height = fabricObject.height;
	const leftBorderRadius = 4; // Border radius for left corners

	ctx.save(); // Save canvas state
	ctx.translate(left + 6, top);
	ctx.rotate(util.degreesToRadians(fabricObject.angle));

	// Draw the rectangle with left corners rounded
	ctx.fillStyle = "rgba(255,255,255, 1)";
	ctx.beginPath();
	ctx.moveTo(-width / 2, -height / 2 + leftBorderRadius);
	ctx.lineTo(-width / 2, height / 2 - leftBorderRadius);
	ctx.quadraticCurveTo(-width / 2, height / 2, -width / 2 + leftBorderRadius, height / 2);
	ctx.lineTo(width / 2, height / 2);
	ctx.lineTo(width / 2, -height / 2);
	ctx.lineTo(-width / 2 + leftBorderRadius, -height / 2);
	ctx.quadraticCurveTo(-width / 2, -height / 2, -width / 2, -height / 2 + leftBorderRadius);
	ctx.fill();

	// Draw a single rounded line, centered horizontally within the rectangle
	const lineWidth = 2.5;
	const lineHeight = 16;
	const lineRadius = lineWidth / 2;
	ctx.fillStyle = "#333"; // Line color

	// Draw the rounded line using rounded rectangle
	ctx.beginPath();
	ctx.roundRect(-lineWidth / 2, -lineHeight / 2, lineWidth, lineHeight, lineRadius);
	ctx.fill();
	ctx.restore();
}

export function drawVerticalRightIcon(
	ctx: CanvasRenderingContext2D,
	left: number,
	top: number,
	_styleOverride: any,
	fabricObject: FabricObject,
) {
	const width = 10; // Rectangle width (increased by 1)
	const height = fabricObject.height;
	const rightBorderRadius = 4; // Border radius for right corners

	ctx.save(); // Save canvas state
	ctx.translate(left - 6, top);
	ctx.rotate(util.degreesToRadians(fabricObject.angle));

	// Draw the rectangle with right corners rounded
	ctx.fillStyle = "rgba(255,255,255, 1)";
	ctx.beginPath();
	ctx.moveTo(width / 2, -height / 2 + rightBorderRadius);
	ctx.lineTo(width / 2, height / 2 - rightBorderRadius);
	ctx.quadraticCurveTo(width / 2, height / 2, width / 2 - rightBorderRadius, height / 2);
	ctx.lineTo(-width / 2, height / 2);
	ctx.lineTo(-width / 2, -height / 2);
	ctx.lineTo(width / 2 - rightBorderRadius, -height / 2);
	ctx.quadraticCurveTo(width / 2, -height / 2, width / 2, -height / 2 + rightBorderRadius);
	ctx.fill();

	// Draw a single rounded line, centered horizontally within the rectangle
	const lineWidth = 2.5;
	const lineHeight = 16;
	const lineRadius = lineWidth / 2;
	ctx.fillStyle = "#333"; // Line color

	// Draw the rounded line using rounded rectangle
	ctx.beginPath();
	ctx.roundRect(-lineWidth / 2, -lineHeight / 2, lineWidth, lineHeight, lineRadius);
	ctx.fill();

	ctx.restore();
}
