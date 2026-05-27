import cors from "@fastify/cors";
import Fastify from "fastify";

const PORT = 8002;
const HOST = "127.0.0.1";

const mockUser = {
	displayName: "דניאל ריספלר",
	id: "user-001",
};

const mockChannels = [
	{ _id: "ch-001", name: "ערוץ פיקוד מרכז", type: "unit", subType: "command" },
	{ _id: "ch-002", name: "ערוץ חטיבה 7", type: "unit", subType: "brigade" },
	{ _id: "ch-003", name: "ערוץ גדוד 51", type: "unit", subType: "battalion" },
	{ _id: "ch-004", name: "ערוץ פיקוד צפון", type: "unit", subType: "command" },
	{ _id: "ch-005", name: "ערוץ חיל האוויר", type: "unit", subType: "corps" },
	{ _id: "ch-006", name: "ערוץ חיל הים", type: "unit", subType: "corps" },
	{ _id: "ch-007", name: "ערוץ מחלקת הדרכה", type: "unit", subType: "department" },
	{ _id: "ch-008", name: 'ערוץ בסיס נח"ל', type: "unit", subType: "base" },
];

const app = Fastify({ logger: { level: "info" } });

await app.register(cors, { origin: true, credentials: true });

app.get("/private/users/me", async () => mockUser);

app.get("/private/media/clip/managed-virtual-channels", async () => mockChannels);

app.get<{ Params: { channelId: string }; Querystring: { start?: string; end?: string } }>(
	"/private/channels/:channelId/play",
	async (req) => {
		const { channelId } = req.params;
		const start = Number(req.query.start ?? 0);
		const end = Number(req.query.end ?? start + 537284);
		return {
			url: "/vod/mock-generate",
			timeRanges: [[start, end]],
			token: `mock-vod-token-${channelId}`,
		};
	},
);

app.listen({ port: PORT, host: HOST }, (err) => {
	if (err) {
		app.log.error(err);
		process.exit(1);
	}
	app.log.info(`core-mock running at http://${HOST}:${PORT}`);
});
