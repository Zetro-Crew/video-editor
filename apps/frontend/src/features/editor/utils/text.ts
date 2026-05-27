let _measureDiv: HTMLDivElement | null = null;

function getMeasureDiv(): HTMLDivElement {
	if (!_measureDiv) {
		_measureDiv = document.createElement("div");
		_measureDiv.style.visibility = "hidden";
		_measureDiv.style.position = "absolute";
		_measureDiv.style.top = "-9999px";
		_measureDiv.style.left = "-9999px";
		_measureDiv.style.pointerEvents = "none";
		document.body.appendChild(_measureDiv);
	}
	return _measureDiv;
}

type BaseProps = {
	family: string;
	fontSize: string;
	lineHeight: string;
	text: string;
	fontWeight: string;
	letterSpacing: string;
	textShadow: string;
	webkitTextStroke: string;
	id?: string;
	textTransform: string;
};

type TextHeightProps = BaseProps & {
	width: string;
};

export function htmlToPlainText(html: string): string {
	const div = document.createElement("div");
	div.innerHTML = html;

	const lines: string[] = [];

	for (const child of div.childNodes) {
		if (child.nodeType === Node.ELEMENT_NODE) {
			const el = child as HTMLElement;

			// Explicit handling for <br>
			if (el.tagName === "BR") {
				lines.push("");
			}

			// Each <div> or <p> becomes a new line (even if it's empty)
			else if (el.tagName === "DIV" || el.tagName === "P") {
				// If it contains <br> or is empty, it still counts as a line
				const text = el.textContent?.replace(/\u00A0/g, ""); // Remove non-breaking spaces
				lines.push(text || "");
			}
		} else if (child.nodeType === Node.TEXT_NODE) {
			lines.push(child.textContent || "");
		}
	}

	return lines.join("\n");
}

const sanitizeHtmlRemoveHeights = (html: string): string => {
	return html.replace(/\s*height\s*:\s*[^;}"']+;?/gi, "");
};

export const calculateTextHeight = (props: TextHeightProps) => {
	const {
		family,
		fontSize,
		width,
		lineHeight,
		letterSpacing,
		textShadow,
		webkitTextStroke,
		fontWeight,
		textTransform,
		text,
	} = props;

	const div = getMeasureDiv();
	div.removeAttribute("style");
	div.style.visibility = "hidden";
	div.style.position = "absolute";
	div.style.top = "-9999px";
	div.style.left = "-9999px";
	div.style.pointerEvents = "none";

	const cleanText = sanitizeHtmlRemoveHeights(text);

	div.innerHTML = cleanText || "a";

	div.style.whiteSpace = "normal";
	div.style.overflowWrap = "break-word";
	div.style.wordSpacing = "normal";
	div.style.wordBreak = "normal";
	div.style.height = "";

	div.style.width = width;
	div.style.fontSize = fontSize;
	div.style.fontFamily = family;
	div.style.lineHeight = lineHeight;
	div.style.fontWeight = fontWeight;
	div.style.letterSpacing = letterSpacing;
	div.style.webkitTextStroke = webkitTextStroke;
	div.style.textShadow = textShadow;
	div.style.textTransform = textTransform;
	div.style.minWidth = `${1}ch`;

	return div.clientHeight;
};

export const calculateMinWidth = (props: Omit<TextHeightProps, "width">) => {
	const {
		family,
		fontSize,
		lineHeight,
		letterSpacing,
		textShadow,
		webkitTextStroke,
		fontWeight,
		textTransform,
	} = props;

	const div = getMeasureDiv();
	div.removeAttribute("style");
	div.style.visibility = "hidden";
	div.style.position = "absolute";
	div.style.top = "-9999px";
	div.style.left = "-9999px";
	div.style.pointerEvents = "none";
	div.style.whiteSpace = "pre-wrap";
	div.style.overflowWrap = "break-word";

	div.style.fontSize = fontSize;
	div.style.fontFamily = family;
	div.style.lineHeight = lineHeight;
	div.style.height = "fit-content";
	div.style.fontWeight = fontWeight;
	div.style.letterSpacing = letterSpacing;
	div.style.webkitTextStroke = webkitTextStroke;
	div.style.textShadow = textShadow;
	div.style.textTransform = textTransform;
	div.style.width = "0px";
	div.style.minWidth = `${1}ch`;
	div.textContent = "aaa";

	return div.clientWidth;
};
