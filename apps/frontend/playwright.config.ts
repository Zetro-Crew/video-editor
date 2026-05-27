import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	timeout: 30_000,
	expect: { timeout: 10_000 },
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: "list",

	use: {
		baseURL: "http://127.0.0.1:3000",
		trace: "on-first-retry",
	},

	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],

	webServer: {
		command: "pnpm dev --host 127.0.0.1",
		url: "http://127.0.0.1:3000",
		reuseExistingServer: true,
		timeout: 60_000,
	},
});
