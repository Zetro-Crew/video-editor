import { dispatch } from "@designcombo/events";
import { EDIT_OBJECT } from "@designcombo/state";
import type { ITrackItem } from "@designcombo/types";
import { useCallback, useEffect, useState } from "react";

type ItemPatch = {
	details?: Record<string, unknown>;
	[key: string]: unknown;
};

function mergeItemPatch<T extends ITrackItem>(prev: T, patch: ItemPatch): T {
	const next = { ...prev } as Record<string, unknown>;
	for (const [key, value] of Object.entries(patch)) {
		if (key === "details" && typeof value === "object" && value !== null) {
			next.details = { ...(prev.details as object), ...(value as object) };
		} else {
			next[key] = value;
		}
	}
	return next as T;
}

export function useTrackItemEditor<T extends ITrackItem>(trackItem: T) {
	const [properties, setProperties] = useState<T>(trackItem);

	useEffect(() => {
		setProperties(trackItem);
	}, [trackItem]);

	const update = useCallback(
		(patch: ItemPatch) => {
			dispatch(EDIT_OBJECT, { payload: { [trackItem.id]: patch } });
			setProperties((prev) => mergeItemPatch(prev, patch));
		},
		[trackItem.id],
	);

	return { properties, setProperties, update };
}
