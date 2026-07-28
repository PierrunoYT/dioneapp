import ScriptCard from "@/components/features/home/feed/card";
import type { Script } from "@/components/features/home/feed/types";
import Loading from "@/components/features/home/loading-skeleton";
import { useTranslation } from "@/translations/translation-context";
import { apiFetch } from "@/utils/api";
import { FeedCache } from "@/utils/cache";
import { openLink } from "@/utils/open-link";
import { useOnlineStatus } from "@/utils/use-online-status";
import { useCallback, useEffect, useRef, useState } from "react";

interface ScriptListProps {
	endpoint: string;
	type?: string;
	className?: string;
}

export default function List({
	endpoint,
	type,
	className = "",
}: ScriptListProps) {
	const { t } = useTranslation();
	const [scripts, setScripts] = useState<Script[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [page, setPage] = useState(1);
	const [hasMore, setHasMore] = useState(true);
	const [isUsingCache, setIsUsingCache] = useState(false);
	const observer = useRef<IntersectionObserver | null>(null);
	const limit = 10;
	const loadingRef = useRef(false);
	const requestRef = useRef<
		| {
				generation: number;
				controller: AbortController;
		  }
		| undefined
	>(undefined);
	const isOnline = useOnlineStatus();

	const fetchScripts = useCallback(
		async (pageNum: number) => {
			if (!hasMore || loadingRef.current) return;

			requestRef.current?.controller.abort();
			const request = {
				generation: (requestRef.current?.generation ?? 0) + 1,
				controller: new AbortController(),
			};
			requestRef.current = request;
			const isCurrent = () => requestRef.current === request;
			loadingRef.current = true;

			if (!isOnline) {
				const cached = FeedCache.get(endpoint);
				if (cached) {
					if (!isCurrent()) return;
					setScripts(cached);
					setIsUsingCache(true);
					setHasMore(false);
					setLoading(false);
					loadingRef.current = false;
					return;
				}
				if (!isCurrent()) return;
				setError(t("feedErrors.offline"));
				setLoading(false);
				loadingRef.current = false;
				return;
			}

			try {
				const url = new URL(endpoint, "http://localhost");
				url.searchParams.set("page", pageNum.toString());
				url.searchParams.set("limit", limit.toString());

				const response = await apiFetch(`${url.pathname}${url.search}`, {
					method: "GET",
					headers: { "Content-Type": "application/json" },
					signal: request.controller.signal,
				});

				if (!response.ok) {
					throw new Error(`HTTP error! status: ${response.status}`);
				}

				const data = await response.json();
				if (!isCurrent()) return;

				if (data.status === 404) {
					setHasMore(false);
					return;
				}

				if (!Array.isArray(data)) {
					throw new Error("Invalid data format from API");
				}

				setScripts((prev) => {
					const existingIds = new Set(prev.map((s) => s.id));
					const newItems = data.filter((script) => !existingIds.has(script.id));
					const updatedScripts = [...prev, ...newItems];
					return updatedScripts;
				});
				if (pageNum === 1 && data.length > 0 && isCurrent()) {
					FeedCache.set(endpoint, data);
				}

				setPage(pageNum + 1);
				setHasMore(data.length >= limit);
				setIsUsingCache(false);
			} catch (err) {
				if (!isCurrent() || request.controller.signal.aborted) return;
				console.error(err);

				const cached = FeedCache.get(endpoint);
				if (cached && pageNum === 1) {
					setScripts(cached);
					setIsUsingCache(true);
					setHasMore(false);
				} else {
					setError("Failed to fetch scripts");
				}
			} finally {
				if (isCurrent()) {
					setLoading(false);
					loadingRef.current = false;
				}
			}
		},
		[endpoint, hasMore, limit, isOnline, t],
	);

	const lastElementRef = useCallback(
		(node: HTMLDivElement | null) => {
			if (loading || !hasMore) return;
			if (observer.current) observer.current.disconnect();

			observer.current = new IntersectionObserver((entries) => {
				if (entries[0].isIntersecting && hasMore && !loadingRef.current) {
					fetchScripts(page);
				}
			});

			if (node) observer.current.observe(node);
		},
		[loading, hasMore, fetchScripts, page],
	);

	useEffect(() => {
		requestRef.current?.controller.abort();
		requestRef.current = undefined;
		// clear
		setScripts([]);
		setPage(1);
		setHasMore(true);
		setError(null);
		setLoading(true);
		loadingRef.current = false;
	}, [endpoint]);

	useEffect(
		() => () => {
			requestRef.current?.controller.abort();
			requestRef.current = undefined;
		},
		[],
	);

	useEffect(() => {
		if (loading) {
			fetchScripts(1);
		}
	}, [loading, fetchScripts]);

	if (loading && scripts.length === 0) {
		return <Loading />;
	}

	return (
		<div className={`w-full ${className} last:mb-4`}>
			{isUsingCache && (
				<div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-200 text-sm">
					{t("feed.viewingCached")}
				</div>
			)}
			<div className="grid grid-cols-2 gap-4">
				{scripts.map((script, index) => (
					<ScriptCard
						key={script.id}
						script={script}
						innerRef={index === scripts.length - 1 ? lastElementRef : null}
						disabled={!isOnline}
					/>
				))}
			</div>

			{loading && scripts.length > 0 && (
				<div className="text-center text-neutral-500 text-sm mt-4">
					{t("feed.loadingMore")}
				</div>
			)}

			{!loading && scripts.length === 0 && type !== "featured" && (
				<div className="text-center text-neutral-500 text-sm mt-4">
					{t("feed.noScripts")}
				</div>
			)}

			{!loading && !error && !hasMore && (
				<div className="text-center text-neutral-500 text-sm flex flex-col gap-2 mt-12">
					<span>{t("feed.reachedEnd")}</span>
					<span>
						{t("feed.notEnoughApps")}{" "}
						<button
							type="button"
							onClick={() =>
								openLink(
									"https://getdione-app.pages.dev/developer-guide/creating-a-dione-script",
								)
							}
							className="cursor-pointer hover:text-neutral-300 underline underline-offset-4 text-neutral-400 transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-white/70"
						>
							{t("feed.helpAddMore")}
						</button>
						.
					</span>
				</div>
			)}
			{error && (
				<div className="text-center text-red-400 text-sm mt-4">{error}</div>
			)}
		</div>
	);
}
