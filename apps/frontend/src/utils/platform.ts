export const isMac = (): boolean =>
	/Mac|iPhone|iPad|iPod/.test(navigator.platform) || navigator.userAgent.includes("Mac");
