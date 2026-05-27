export const getAlphaValue = (value: string) => {
	const sanitizedValue = value.replace(/%/i, "");
	if (sanitizedValue[0] === "0" && sanitizedValue.length > 1) {
		return sanitizedValue.substring(1);
	}
	if (Number(sanitizedValue) >= 100) {
		return 100;
	}
	if (!Number.isNaN(Number(sanitizedValue))) {
		return sanitizedValue || 0;
	}
	return Number.parseInt(sanitizedValue, 10);
};

export const onlyDigits = (string: string) => {
	return string ? string.substring(0, 3).replace(/[^\d]/g, "") : "";
};

export const onlyLatins = (string: string) => {
	return string ? string.substring(0, 7) : string;
};
