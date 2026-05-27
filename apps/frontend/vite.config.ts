import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { UserConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
	} satisfies UserConfig["test"],
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
					if (
						id.includes("@radix-ui/react-accordion") ||
						id.includes("@radix-ui/react-avatar") ||
						id.includes("@radix-ui/react-checkbox") ||
						id.includes("@radix-ui/react-dialog") ||
						id.includes("@radix-ui/react-dropdown-menu") ||
						id.includes("@radix-ui/react-label") ||
						id.includes("@radix-ui/react-popover") ||
						id.includes("@radix-ui/react-scroll-area") ||
						id.includes("@radix-ui/react-select") ||
						id.includes("@radix-ui/react-separator") ||
						id.includes("@radix-ui/react-slider") ||
						id.includes("@radix-ui/react-slot") ||
						id.includes("@radix-ui/react-switch") ||
						id.includes("@radix-ui/react-tabs") ||
						id.includes("@radix-ui/react-toggle") ||
						id.includes("@radix-ui/react-tooltip")
					)
						return "vendor-radix";
					if (
						id.includes("@designcombo/state") ||
						id.includes("@designcombo/timeline") ||
						id.includes("@designcombo/animations") ||
						id.includes("@designcombo/events") ||
						id.includes("@designcombo/types") ||
						id.includes("@designcombo/frames")
					)
						return "vendor-designcombo";
					if (
						id.includes("@remotion/player") ||
						id.includes("@remotion/media-utils") ||
						id.includes("@remotion/media") ||
						id.includes("@remotion/shapes") ||
						id.includes("remotion")
					)
						return "vendor-remotion";
					if (id.includes("react-dom") || id.includes("react-router-dom") || id.includes("/react/"))
						return "vendor-react";
				},
			},
		},
	},
});
