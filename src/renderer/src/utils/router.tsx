import {
	type PropsWithChildren,
	forwardRef,
	useCallback,
	useSyncExternalStore,
} from "react";
import { Router, useLocation as useWouterLocation } from "wouter";

interface NavigationOptions {
	replace?: boolean;
	state?: unknown;
}

interface LocationTarget {
	pathname: string;
	search?: string;
}

type Navigate = (to: string | number, options?: NavigationOptions) => void;

const subscribe = (callback: () => void) => {
	window.addEventListener("hashchange", callback);
	window.addEventListener("popstate", callback);
	return () => {
		window.removeEventListener("hashchange", callback);
		window.removeEventListener("popstate", callback);
	};
};

export const readHashRoute = (hash: string) => `/${hash.replace(/^#?\/?/, "")}`;

export const routeToHashHref = (route: string) =>
	`#/${route.replace(/^#?\/?/, "")}`;

export const resolveRouteTarget = (to: string | LocationTarget) =>
	typeof to === "string" ? to : `${to.pathname}${to.search ?? ""}`;

export const shouldHandleLinkClick = ({
	button,
	defaultPrevented,
	metaKey,
	ctrlKey,
	shiftKey,
	altKey,
	target,
}: {
	button: number;
	defaultPrevented: boolean;
	metaKey: boolean;
	ctrlKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
	target?: string;
}) =>
	button === 0 &&
	!defaultPrevented &&
	!metaKey &&
	!ctrlKey &&
	!shiftKey &&
	!altKey &&
	(!target || target === "_self");

export const shouldReplaceRoute = (
	currentRoute: string,
	targetRoute: string,
	replace?: boolean,
) => replace ?? currentRoute === targetRoute;

const navigateHash = (to: string, options: NavigationOptions = {}) => {
	const oldURL = window.location.href;
	const url = new URL(oldURL);
	url.hash = routeToHashHref(to).slice(1);
	const newURL = url.href;

	if (options.replace) {
		window.history.replaceState(options.state ?? null, "", newURL);
	} else {
		window.history.pushState(options.state ?? null, "", newURL);
	}

	window.dispatchEvent(new HashChangeEvent("hashchange", { oldURL, newURL }));
};

const useHashLocation = Object.assign(
	() => {
		const location = useSyncExternalStore(
			subscribe,
			() => readHashRoute(window.location.hash),
			() => "/",
		);
		return [location, navigateHash] as [string, typeof navigateHash];
	},
	{ hrefs: routeToHashHref },
);

export function HashRouter({ children }: PropsWithChildren) {
	return <Router hook={useHashLocation}>{children}</Router>;
}

export function useLocation() {
	const [route] = useWouterLocation();
	const state = useSyncExternalStore(
		subscribe,
		() => window.history.state,
		() => null,
	);
	const queryStart = route.indexOf("?");
	return {
		pathname: queryStart === -1 ? route : route.slice(0, queryStart),
		search: queryStart === -1 ? "" : route.slice(queryStart),
		state,
	};
}

export function useNavigate(): Navigate {
	const [, navigate] = useWouterLocation();
	return useCallback(
		(to, options) => {
			if (typeof to === "number") {
				window.history.go(to);
				return;
			}
			navigate(to, options);
		},
		[navigate],
	);
}

interface LinkProps
	extends Omit<React.ComponentPropsWithoutRef<"a">, "href" | "onClick"> {
	to: string | LocationTarget;
	replace?: boolean;
	state?: unknown;
	onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
	{ to, replace, state, target, onClick, ...props },
	ref,
) {
	const [currentRoute, navigate] = useWouterLocation();
	const targetRoute = resolveRouteTarget(to);
	const handleClick: React.MouseEventHandler<HTMLAnchorElement> = (event) => {
		onClick?.(event);
		if (
			!shouldHandleLinkClick({
				button: event.button,
				defaultPrevented: event.defaultPrevented,
				metaKey: event.metaKey,
				ctrlKey: event.ctrlKey,
				shiftKey: event.shiftKey,
				altKey: event.altKey,
				target,
			})
		)
			return;

		event.preventDefault();
		navigate(targetRoute, {
			replace: shouldReplaceRoute(currentRoute, targetRoute, replace),
			state,
		});
	};

	return (
		<a
			ref={ref}
			href={routeToHashHref(targetRoute)}
			target={target}
			onClick={handleClick}
			{...props}
		/>
	);
});
