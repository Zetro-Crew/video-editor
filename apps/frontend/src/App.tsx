import { Route, Routes } from "react-router-dom";
import EditPage from "@/pages/EditPage";
import Home from "@/pages/Home";

export default function App() {
	return (
		<Routes>
			<Route path="/" element={<Home />} />
			<Route path="/edit" element={<EditPage />} />
			<Route path="/edit/:id" element={<EditPage />} />
			<Route path="/editor/embed" element={<EditPage />} />
		</Routes>
	);
}
