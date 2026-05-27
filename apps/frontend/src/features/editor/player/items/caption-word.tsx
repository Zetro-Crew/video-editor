import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type React from "react";
import { useCurrentPlayerFrame } from "../../hooks/use-current-frame";
import useEditorRefs from "../../store/use-editor-refs";
import { ANIMATION_CAPTION_LIST } from "./caption-animations";
import {
	ANIMATION_CONFIGS,
	ANIMATION_FUNCTIONS,
	createAnimationFunctions,
	type WordAnimationState,
} from "./caption-word-animations";

interface WordSpanProps {
	isActive: boolean;
	activeFillColor: string;
	wordColor: string;
	scale: number;
	animation: string;
	isAppeared: boolean;
	scaleFactor: number;
	animationNoneCaption: boolean;
	showObject: string;
	highlightScale: number;
}

const WordSpan = styled.span<WordSpanProps>`
  position: relative;
  display: inline-block;
  padding: 0 0.2em;
  color: ${(props) => props.wordColor};
  scale: ${(props) => props.scale};
  border-radius: 16px;
  z-index: 99;

  ${(props) => {
		if (props.isActive && props.animation.includes("underline-effect")) {
			return `
        text-decoration: underline;
        text-decoration-color: #9238ef;
        text-decoration-thickness: 0.2em;
      `;
		}

		if (!props.isActive && props.animationNoneCaption) {
			return "display: none;";
		}

		if (
			!props.isAppeared &&
			(ANIMATION_CAPTION_LIST.includes(props.animation) || props.showObject === "word")
		) {
			return "display: none;";
		}

		if (!props.isActive && props.animation === "customAnimation1") {
			return "display: none;";
		}

		return "";
	}}

  &::before {
    content: "";
    position: absolute;
    z-index: -1;
    left: -0.2em;
    right: -0.2em;
    top: 0;
    bottom: 0;
    border-radius: ${(props) => `${props.scaleFactor * 16}px`};
    transform: scale(${(props) => props.highlightScale});
  }

  ${(props) =>
		props.isActive &&
		css`
      &::before {
        background-color: ${props.activeFillColor};
        transform-origin: center;
      }
    `}
`;

interface CaptionWordProps {
	word: any;
	offsetFrom: number;
	activeColor: string;
	activeFillColor: string;
	appearedColor: string;
	color: string;
	animation: string;
	globalOpacity?: number;
	isKeywordColor: string;
	preservedColorKeyWord: boolean;
	scaleFactor: number;
	animationNoneCaption: boolean;
	showObject: string;
	lineIndex?: number;
	currentLine?: number;
}

export const CaptionWord: React.FC<CaptionWordProps> = ({
	word,
	offsetFrom,
	activeColor,
	activeFillColor,
	appearedColor,
	color,
	animation,
	globalOpacity,
	isKeywordColor,
	preservedColorKeyWord,
	scaleFactor,
	animationNoneCaption,
	showObject,
	lineIndex,
	currentLine,
}) => {
	const fps = 30;
	const { playerRef } = useEditorRefs();
	const currentFrame = useCurrentPlayerFrame(playerRef!);
	const { start, end } = word;
	const startAtFrame = ((start + offsetFrom) / 1000) * fps;
	const endAtFrame = ((end + offsetFrom) / 1000) * fps;
	const isActive = currentFrame > startAtFrame && currentFrame < endAtFrame;
	const isAppeared = currentFrame > startAtFrame;

	// Handle line-based visibility
	if (showObject === "line" && lineIndex !== undefined && currentLine !== undefined) {
		if (lineIndex > currentLine) {
			return null;
		}
	}

	// Word color logic
	const getWordColor = () => {
		const baseColor = isActive ? activeColor : isAppeared ? appearedColor : color;

		if (word.is_keyword && isKeywordColor !== "transparent") {
			if (isActive || (preservedColorKeyWord && isAppeared)) {
				return isKeywordColor;
			}
		}

		return baseColor;
	};

	const wordColor = getWordColor();

	// Calculate animation state
	const animationState = calculateAnimationState(
		currentFrame,
		startAtFrame,
		endAtFrame,
		animation,
		word,
		globalOpacity,
	);

	// Display text logic
	const getDisplayText = () => {
		if (animation.includes("typewriter-effect")) {
			const totalLetters = word.word.length;
			const animationDuration = endAtFrame - startAtFrame;
			const lettersToShow = Math.min(
				totalLetters,
				Math.floor(((currentFrame - startAtFrame) / animationDuration) * totalLetters),
			);
			return word.word.slice(0, lettersToShow);
		}
		return word.word;
	};

	const displayText = getDisplayText();
	const highlightScale = calculateHighlightScale(animation, currentFrame, startAtFrame, endAtFrame);

	// Transform style helper
	const getTransformStyle = () => {
		const transforms = [];
		if (animationState.translateX !== 0 || animationState.translateY !== 0) {
			transforms.push(`translate(${animationState.translateX}px, ${animationState.translateY}px)`);
		}
		return transforms.length > 0 ? transforms.join(" ") : undefined;
	};

	return (
		<WordSpan
			isActive={isActive}
			wordColor={wordColor}
			activeFillColor={activeFillColor}
			scale={animationState.scale}
			animation={animation}
			animationNoneCaption={animationNoneCaption}
			style={{
				opacity: animationState.opacity,
				...(getTransformStyle() && { transform: getTransformStyle() }),
			}}
			isAppeared={isAppeared}
			scaleFactor={scaleFactor}
			showObject={showObject}
			highlightScale={highlightScale}
		>
			{displayText}
		</WordSpan>
	);
};

const PULSING_ANIMATIONS = new Set([
	"captionAnimation10",
	"captionAnimationKeyword42",
	"captionAnimationKeyword48",
	"captionAnimationKeyword57",
]);

function calculateHighlightScale(
	animation: string,
	currentFrame: number,
	startAtFrame: number,
	endAtFrame: number,
) {
	if (!PULSING_ANIMATIONS.has(animation)) {
		return 1;
	}

	const { pulseAnim } = createAnimationFunctions(currentFrame, startAtFrame, endAtFrame);

	return pulseAnim().scale ?? 1;
}

function calculateAnimationState(
	currentFrame: number,
	startAtFrame: number,
	endAtFrame: number,
	animation: string,
	word: any,
	globalOpacity?: number,
): WordAnimationState {
	const initialState: WordAnimationState = {
		opacity: 1,
		scale: 1,
		translateX: 0,
		translateY: 0,
	};

	// Apply basic animation effects
	const basicEffects = {
		scaleAnimationLetterEffect: () => ({
			scale: currentFrame > startAtFrame && currentFrame < endAtFrame ? 1.4 : 0.9,
		}),
		animationScaleMinEffect: () => ({ scale: 0.8 }),
		animationScaleDinamicEffect: () => ({ scale: word.is_keyword ? 1.4 : 0.9 }),
		captionAnimation26: () => ({
			opacity: currentFrame > startAtFrame && currentFrame < endAtFrame ? 1 : 0.6,
		}),
	};

	// Apply basic effects
	Object.entries(basicEffects).forEach(([effect, handler]) => {
		if (animation.includes(effect) || animation === effect) {
			Object.assign(initialState, handler());
		}
	});

	// Create animation helpers
	const animationHelpers = createAnimationFunctions(currentFrame, startAtFrame, endAtFrame);

	// Apply animation configurations
	const animationConfig = ANIMATION_CONFIGS[animation];
	if (animationConfig) {
		const configResult = animationConfig(animationHelpers);
		Object.assign(initialState, configResult);
	}

	// Apply animation functions from slash-separated animations
	const selectedAnimations = animation.split("/") || [];
	selectedAnimations.forEach((anim) => {
		const animationFn = ANIMATION_FUNCTIONS[anim];
		if (animationFn) {
			const result = animationFn(animationHelpers);
			Object.assign(initialState, result);
		}
	});

	// Handle global opacity
	if (globalOpacity !== undefined) {
		initialState.opacity = globalOpacity;
	}

	return initialState;
}
