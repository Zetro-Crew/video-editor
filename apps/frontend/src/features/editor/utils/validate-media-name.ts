const INVALID_CHARS = /[\\/:?*"]/;

export function validateMediaName(value: string): string | null {
	if (value.length === 0) return null;
	if (value.length > 70) return "שם ארוך מדי (מקסימום 70 תווים)";
	if (INVALID_CHARS.test(value)) return 'תווים אסורים: \\ / : ? * "';
	return null;
}
