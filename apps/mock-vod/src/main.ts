import { DEFAULT_HOST, DEFAULT_PORT } from "./config.ts";
import { buildMockVod } from "./index.ts";

const port = Number(process.env.MOCK_VOD_PORT ?? DEFAULT_PORT);
const host = process.env.MOCK_VOD_HOST ?? DEFAULT_HOST;

const { app, fixtureWindow } = await buildMockVod({ logger: true });

app.listen({ port, host }, (err) => {
	if (err) {
		app.log.error(err);
		process.exit(1);
	}
	app.log.info(`mock-vod running at http://${host}:${port}`);
	app.log.info(
		`Fixture window: ${fixtureWindow.startMs} → ${fixtureWindow.endMs} (recording ${fixtureWindow.recordingId})`,
	);
});
