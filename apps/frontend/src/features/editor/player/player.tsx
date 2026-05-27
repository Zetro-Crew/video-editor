import { type PlayerRef, Player as RemotionPlayer } from "@remotion/player";
import { useEffect, useRef } from "react";
import useCompositionStore from "../store/use-composition-store";
import useEditorRefs from "../store/use-editor-refs";
import Composition from "./composition";

const Player = () => {
	const playerRef = useRef<PlayerRef>(null);
	const { duration, fps, size, background } = useCompositionStore();
	const { setPlayerRef } = useEditorRefs();

	useEffect(() => {
		setPlayerRef(playerRef as React.RefObject<PlayerRef>);
	}, [setPlayerRef]);

	return (
		<RemotionPlayer
			ref={playerRef}
			component={Composition}
			durationInFrames={Math.round((duration / 1000) * fps) || 1}
			compositionWidth={size.width}
			compositionHeight={size.height}
			className="h-full w-full"
			fps={fps}
			style={{ backgroundColor: background.value }}
			overflowVisible
		/>
	);
};
export default Player;
