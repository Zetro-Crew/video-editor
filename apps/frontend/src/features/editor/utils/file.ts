export const getFileFromUrl = async (url: string) => {
	const response = await fetch(url);
	const blob = await response.blob();
	const filename = url.split("/").pop() || "video.mp4";
	const file = new File([blob], filename);
	return file;
};
