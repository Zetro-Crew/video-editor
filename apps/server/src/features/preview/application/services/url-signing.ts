import { createHmac, timingSafeEqual } from "node:crypto";

export type SrcKind = "channel-range" | "media-id";

export function signUrl(secret: string, url: string, token: string, srcKind: SrcKind): string {
	return createHmac("sha256", secret).update(`${url}\n${token}\n${srcKind}`).digest("base64url");
}

export function verifyUrlSignature(
	secret: string,
	url: string,
	token: string,
	srcKind: SrcKind,
	sig: string,
): boolean {
	if (!sig) return false;
	const expected = signUrl(secret, url, token, srcKind);
	const a = Buffer.from(expected);
	const b = Buffer.from(sig);
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}
