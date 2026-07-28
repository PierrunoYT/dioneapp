import { supabase } from "@/server/utils/database";
import logger from "@/server/utils/logger";
import type { Tunnel } from "localtunnel";
import localtunnel from "localtunnel";
import { nanoid } from "nanoid";

let activeTunnel: Tunnel | null = null;
let currentTunnelUrl: string | null = null;
let currentShortUrl: string | null = null;
let lifecycle = Promise.resolve();

let urlCreationTimestamps: number[] = [];

export interface TunnelInfo {
	url: string;
	type: "localtunnel";
	status: "active" | "connecting" | "error";
	shortUrl?: string;
}

function serialize<T>(operation: () => Promise<T>): Promise<T> {
	const result = lifecycle.then(operation, operation);
	lifecycle = result.then(
		() => undefined,
		() => undefined,
	);
	return result;
}

function stopActiveTunnel(): void {
	const tunnel = activeTunnel;
	activeTunnel = null;
	currentTunnelUrl = null;
	currentShortUrl = null;
	tunnel?.close();
}

export function startLocaltunnel(port: number): Promise<TunnelInfo> {
	return serialize(async () => {
		try {
			stopActiveTunnel();
			logger.info(`Starting Localtunnel on port ${port}...`);
			const tunnel = await localtunnel({ port });

			activeTunnel = tunnel;
			currentTunnelUrl = tunnel.url;
			currentShortUrl = null;

			tunnel.on("close", () => {
				logger.info("Localtunnel closed");
				if (activeTunnel !== tunnel) return;
				activeTunnel = null;
				currentTunnelUrl = null;
				currentShortUrl = null;
			});
			tunnel.on("error", (error) => {
				logger.error("Localtunnel error:", error);
			});

			logger.info(`Localtunnel started: ${tunnel.url}`);
			return {
				url: tunnel.url,
				type: "localtunnel",
				status: "active",
			};
		} catch (error) {
			logger.error("Failed to start Localtunnel:", error);
			throw new Error(`Failed to start Localtunnel: ${error}`);
		}
	});
}

export function stopTunnel(): Promise<void> {
	return serialize(async () => {
		logger.info(
			activeTunnel ? "Closing Localtunnel..." : "Tunnel already stopped",
		);
		stopActiveTunnel();
	});
}

export function getCurrentTunnel(): TunnelInfo | null {
	return currentTunnelUrl
		? {
				url: currentTunnelUrl,
				type: "localtunnel",
				status: "active",
				shortUrl: currentShortUrl || undefined,
			}
		: null;
}

export function isTunnelActive(): boolean {
	return activeTunnel !== null;
}

function isValidUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		if (!["http:", "https:"].includes(parsed.protocol)) return false;

		const hostname = parsed.hostname.toLowerCase();
		return !(
			hostname === "localhost" ||
			hostname.startsWith("127.") ||
			hostname.startsWith("192.168.") ||
			hostname.startsWith("10.") ||
			hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)
		);
	} catch {
		return false;
	}
}

export async function shortenUrl(url: string): Promise<string | null> {
	try {
		if (!supabase) {
			logger.warn("Supabase not configured, skipping URL shortening");
			return null;
		}
		if (!isValidUrl(url)) {
			logger.warn("Invalid URL format or blocked URL");
			return null;
		}

		const now = Date.now();
		urlCreationTimestamps = urlCreationTimestamps.filter(
			(timestamp) => now - timestamp < 60 * 60 * 1000,
		);
		if (urlCreationTimestamps.length >= 10) {
			logger.warn("Rate limit exceeded for URL shortening (max 10 per hour)");
			return null;
		}
		urlCreationTimestamps.push(now);

		for (let attempts = 0; attempts < 5; attempts++) {
			const shortId = nanoid(10);
			const { data: existing } = await supabase
				.from("shared_urls")
				.select("id")
				.eq("id", shortId)
				.single();
			if (existing) {
				logger.warn(`ID collision detected, retrying... (${attempts + 1}/5)`);
				continue;
			}

			const { data, error } = await supabase
				.from("shared_urls")
				.insert({
					id: shortId,
					long_url: url,
					created_at: new Date().toISOString(),
				})
				.select()
				.single();
			if (error) {
				logger.error("Failed to create shortened URL:", error);
				return null;
			}
			const shortUrl = `https://getdione-app.deeivihh.workers.dev/share/${data.id}`;
			if (url === currentTunnelUrl) currentShortUrl = shortUrl;
			logger.info(`Created shortened URL: ${data.id}`);
			return shortUrl;
		}

		logger.error(
			"Failed to generate unique shortened URL after maximum attempts",
		);
		return null;
	} catch (error) {
		logger.error("Error shortening URL:", error);
		return null;
	}
}
