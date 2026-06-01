import { createHmac, timingSafeEqual } from "node:crypto";

export function signUrl(secret: string, url: string, token: string): string {
	return createHmac("sha256", secret).update(`${url}\n${token}`).digest("base64url");
}

export function verifyUrlSignature(
	secret: string,
	url: string,
	token: string,
	sig: string,
): boolean {
	if (!sig) return false;
	const expected = signUrl(secret, url, token);
	const a = Buffer.from(expected);
	const b = Buffer.from(sig);
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}
