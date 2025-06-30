/** @type {import('tailwindcss').Config} */
module.exports = {
	content: [
		"./src/renderer/index.html",
		"./src/renderer/src/**/*.{js,ts,jsx,tsx}",
	],
	darkMode: "class",
	theme: {
		extend: {
			colors: {
				background: {
					light: "#ffffff",
					dark: "#080808",
				},
				surface: {
					light: "#f8fafc",
					dark: "#1a1a1a",
				},
				text: {
					primary: {
						light: "#1f2937",
						dark: "#ffffff",
					},
					secondary: {
						light: "#6b7280",
						dark: "#d1d5db",
					},
				},
			},
		},
	},
	plugins: [],
};
