import { lazy, Suspense } from "react";

const Editor = lazy(() => import("../features/editor/editor"));

export default function Home() {
	return (
		<Suspense fallback={<div className="h-screen w-screen bg-background" />}>
			<Editor />
		</Suspense>
	);
}
