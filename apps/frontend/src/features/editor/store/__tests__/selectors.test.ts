import type { ITrackItem } from "@designcombo/types";
import { describe, expect, it } from "vitest";
import { selectActiveItem } from "../selectors";
import type { ICompositionStore } from "../use-composition-store";

const makeItem = (id: string): ITrackItem =>
	({ id, type: "text", display: { from: 0, to: 1000 } }) as unknown as ITrackItem;

const baseState = (overrides: Partial<ICompositionStore>): ICompositionStore =>
	({
		tracks: [],
		trackItemIds: [],
		trackItemsMap: {},
		activeIds: [],
		duration: 0,
		fps: 30,
		background: { type: "color", value: "transparent" },
		size: { width: 1920, height: 1080 },
		structure: [],
		compositions: [],
		setSize: () => {},
		setCompositions: () => {},
		updateTrackItemDetails: () => {},
		...overrides,
	}) as ICompositionStore;

describe("selectActiveItem", () => {
	it("returns null when no items selected", () => {
		expect(selectActiveItem(baseState({ activeIds: [] }))).toBeNull();
	});

	it("returns null when multiple items selected", () => {
		expect(
			selectActiveItem(
				baseState({
					activeIds: ["a", "b"],
					trackItemsMap: { a: makeItem("a"), b: makeItem("b") },
				}),
			),
		).toBeNull();
	});

	it("returns null when selected id missing from trackItemsMap", () => {
		expect(selectActiveItem(baseState({ activeIds: ["missing"], trackItemsMap: {} }))).toBeNull();
	});

	it("returns the item when exactly one id selected and present", () => {
		const item = makeItem("a");
		const result = selectActiveItem(baseState({ activeIds: ["a"], trackItemsMap: { a: item } }));
		expect(result).toBe(item);
	});
});
