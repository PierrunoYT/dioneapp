import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import "dotenv/config";
import {
	defineConfig,
	defineViteConfig,
	externalizeDepsPlugin,
} from "electron-vite";
import { resolve } from "node:path";

export default defineConfig({
	main: {
		envPrefix: ["VITE_PUBLIC_"],
		plugins: [externalizeDepsPlugin()],
		resolve: {
			alias: {
				"@": resolve("src/main"),
				"@resources": resolve("resources"),
			},
		},
	},
	preload: {
		plugins: [externalizeDepsPlugin()],
	},
	renderer: defineViteConfig(() => ({
		server: {
			port: 2214,
		},
		resolve: {
			alias: {
				"@": resolve("src/renderer/src"),
				"@assets": resolve("src/renderer/src/assets"),
			},
		},
		plugins: [react(), tailwindcss()],
	})),
});
