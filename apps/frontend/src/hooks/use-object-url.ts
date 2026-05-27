import { useEffect, useState } from "react";

export const useObjectUrl = (file?: Blob | File | null) => {
	const [objectUrl, setObjectUrl] = useState<string>("");

	useEffect(() => {
		if (!file) {
			setObjectUrl("");
			return;
		}

		const nextObjectUrl = URL.createObjectURL(file);
		setObjectUrl(nextObjectUrl);

		return () => {
			URL.revokeObjectURL(nextObjectUrl);
		};
	}, [file]);

	return objectUrl;
};
