import { clearCaptionRotationCache } from "../player/items/caption-animations";
import { audioDataManager } from "../player/lib/audio-data";
import useCropStore from "../store/use-crop-store";
import { useDownloadState } from "../store/use-download-state";
import useTimelineViewStore from "../store/use-timeline-view-store";
import useUploadStore from "../store/use-upload-store";

export const resetEditorForNewProject = () => {
	audioDataManager.reset();
	clearCaptionRotationCache();
	useUploadStore.getState().resetUploadStore();
	useCropStore.getState().clear();
	useTimelineViewStore.setState({
		scroll: { left: 0, top: 0 },
	});
	useDownloadState.setState({
		exporting: false,
		submitted: false,
		retryCount: 0,
		error: undefined,
		displayProgressModal: false,
		saveMetadata: undefined,
		payload: undefined,
	});
};
