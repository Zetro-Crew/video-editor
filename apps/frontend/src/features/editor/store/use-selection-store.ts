import { create } from "zustand";

interface ISelectionStore {
	activeIds: string[];
}

const useSelectionStore = create<ISelectionStore>(() => ({
	activeIds: [],
}));

export default useSelectionStore;
