import type { Routes } from "@angular/router";

export const routes: Routes = [
	{
		path: "",
		loadComponent: () =>
			import("./pages/editor-page/editor-page.component").then((m) => m.EditorPageComponent),
	},
];
