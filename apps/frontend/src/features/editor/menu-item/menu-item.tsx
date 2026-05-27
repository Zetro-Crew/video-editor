import useLayoutStore from "../store/use-layout-store";
import { Elements } from "./elements";
import { Uploads } from "./uploads";

const ActiveMenuItem = () => {
	const { activeMenuItem } = useLayoutStore();

	if (activeMenuItem === "elements") {
		return <Elements />;
	}
	if (activeMenuItem === "uploads") {
		return <Uploads />;
	}

	return null;
};

export const MenuItem = () => {
	const { showMenuItem } = useLayoutStore();

	if (!showMenuItem) return null;

	return (
		<div className={"w-full flex-1 flex h-[calc(100%-50px)]"}>
			<ActiveMenuItem />
		</div>
	);
};
