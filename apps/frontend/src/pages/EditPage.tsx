import { lazy, Suspense } from "react";
import { useParams } from "react-router-dom";

const Editor = lazy(() => import("../features/editor/editor"));

export default function EditPage() {
	const { id } = useParams();
	return (
		<Suspense fallback={<div className="h-screen w-screen bg-background" />}>
			<Editor id={id} />
		</Suspense>
	);
}
