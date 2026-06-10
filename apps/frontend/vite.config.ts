import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import type { ViteUserConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");

	return {
		base: env.VITE_PUBLIC_PATH,
		test: {
			environment: "node",
			include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		} satisfies ViteUserConfig["test"],
		plugins: [react()],
		resolve: {
			alias: {
				"@": path.resolve(__dirname, "./src"),
			},
		},
		server: {
			port: 3000,
			proxy: {
				"^/(render|uploads|upload|cleanup|edit-video)": {
					target: process.env.VITE_API_URL || "http://localhost:4001",
					changeOrigin: true,
				},
				"^/editor/(preview-source|segment|demo-assets|export)": {
					target: process.env.VITE_API_URL || "http://localhost:4001",
					changeOrigin: true,
				},
			},
		},
		build: {
			target: "chrome113",
			chunkSizeWarningLimit: 1000,
			sourcemap: "hidden",
			rollupOptions: {
				output: {
					manualChunks(id) {
						if (id.includes("framer-motion")) return "vendor-framer";
						if (id.includes("@radix-ui/")) return "vendor-radix";
						if (id.includes("@designcombo/")) return "vendor-designcombo";
						if (id.includes("remotion")) return "vendor-remotion";
						if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(id))
							return "vendor-react";
					},
				},
			},
		},
	};
});