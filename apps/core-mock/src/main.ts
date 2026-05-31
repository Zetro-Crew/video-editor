import { buildCoreMock } from "./index.ts";

const PORT = Number(process.env.CORE_MOCK_PORT ?? 8002);
const HOST = process.env.CORE_MOCK_HOST ?? "127.0.0.1";
const mockVodBaseUrl = process.env.MOCK_VOD_BASE_URL ?? "http://127.0.0.1:5050";

const { app } = await buildCoreMock({ mockVodBaseUrl, logger: true });

app.listen({ port: PORT, host: HOST }, (err) => {
	if (err) {
		app.log.error(err);
		process.exit(1);
	}
	app.log.info(`core-mock running at http://${HOST}:${PORT}`);
	app.log.info(`Mock VOD: ${mockVodBaseUrl}`);
});
