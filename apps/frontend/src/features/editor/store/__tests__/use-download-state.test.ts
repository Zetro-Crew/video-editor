import { beforeEach, describe, expect, it } from "vitest";
import { useDownloadState } from "../use-download-state";

const baseMeta = {
	mediaName: "test",
	mediaId: "test-id",
	downloadToComputer: true,
	saveToPersonalChannel: false,
	selectedUnitChannelIds: [],
};

beforeEach(() => {
	useDownloadState.setState({
		saveMetadata: undefined,
		submitted: false,
		exporting: false,
		error: undefined,
		retryCount: 0,
	});
});

describe("setSaveMetadata", () => {
	it("stores metadata in state", () => {
		useDownloadState.getState().actions.setSaveMetadata(baseMeta);
		expect(useDownloadState.getState().saveMetadata?.mediaName).toBe("test");
	});

	it("stores downloadToComputer flag", () => {
		useDownloadState.getState().actions.setSaveMetadata({ ...baseMeta, downloadToComputer: false });
		expect(useDownloadState.getState().saveMetadata?.downloadToComputer).toBe(false);
	});

	it("stores selectedUnitChannelIds", () => {
		useDownloadState
			.getState()
			.actions.setSaveMetadata({ ...baseMeta, selectedUnitChannelIds: ["c1", "c2"] });
		expect(useDownloadState.getState().saveMetadata?.selectedUnitChannelIds).toEqual(["c1", "c2"]);
	});
});

describe("setSubmitted", () => {
	it("marks submitted true and clears exporting", () => {
		useDownloadState.setState({ exporting: true });
		useDownloadState.getState().actions.setSubmitted();
		const state = useDownloadState.getState();
		expect(state.submitted).toBe(true);
		expect(state.exporting).toBe(false);
	});

	it("clears error", () => {
		useDownloadState.setState({ error: "some error" });
		useDownloadState.getState().actions.setSubmitted();
		expect(useDownloadState.getState().error).toBeUndefined();
	});
});

describe("setError", () => {
	it("sets error message and clears exporting", () => {
		useDownloadState.setState({ exporting: true });
		useDownloadState.getState().actions.setError("שגיאה כלשהי");
		const state = useDownloadState.getState();
		expect(state.error).toBe("שגיאה כלשהי");
		expect(state.exporting).toBe(false);
	});
});

describe("incrementRetryCount", () => {
	it("increments retryCount by 1", () => {
		useDownloadState.getState().actions.incrementRetryCount();
		expect(useDownloadState.getState().retryCount).toBe(1);
	});

	it("accumulates across calls", () => {
		useDownloadState.getState().actions.incrementRetryCount();
		useDownloadState.getState().actions.incrementRetryCount();
		expect(useDownloadState.getState().retryCount).toBe(2);
	});
});

describe("resetToForm", () => {
	it("clears error, submitted, exporting and resets retryCount", () => {
		useDownloadState.setState({ error: "err", submitted: true, exporting: true, retryCount: 2 });
		useDownloadState.getState().actions.resetToForm();
		const state = useDownloadState.getState();
		expect(state.error).toBeUndefined();
		expect(state.submitted).toBe(false);
		expect(state.exporting).toBe(false);
		expect(state.retryCount).toBe(0);
	});
});
