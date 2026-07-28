import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	readHashRoute,
	resolveRouteTarget,
	routeToHashHref,
	shouldHandleLinkClick,
	shouldReplaceRoute,
} from "./router";

describe("hash routing compatibility", () => {
	it("preserves paths and query strings inside the hash", () => {
		const route = "/install/local%20app?isLocal=true&action=start";
		assert.equal(routeToHashHref(route), `#${route}`);
		assert.equal(readHashRoute(`#${route}`), route);
	});

	it("normalizes empty and slashless hash routes", () => {
		assert.equal(readHashRoute(""), "/");
		assert.equal(readHashRoute("#settings"), "/settings");
	});

	it("resolves link objects without changing their query string", () => {
		assert.equal(
			resolveRouteTarget({
				pathname: "/install/app",
				search: "?isLocal=false",
			}),
			"/install/app?isLocal=false",
		);
	});

	it("allows consumer cancellation and native modified or targeted clicks", () => {
		const primaryClick = {
			button: 0,
			defaultPrevented: false,
			metaKey: false,
			ctrlKey: false,
			shiftKey: false,
			altKey: false,
		};
		assert.equal(shouldHandleLinkClick(primaryClick), true);
		assert.equal(
			shouldHandleLinkClick({ ...primaryClick, defaultPrevented: true }),
			false,
		);
		assert.equal(
			shouldHandleLinkClick({ ...primaryClick, ctrlKey: true }),
			false,
		);
		assert.equal(
			shouldHandleLinkClick({ ...primaryClick, target: "_blank" }),
			false,
		);
	});

	it("replaces same-route links unless explicitly overridden", () => {
		assert.equal(shouldReplaceRoute("/library", "/library"), true);
		assert.equal(shouldReplaceRoute("/", "/library"), false);
		assert.equal(shouldReplaceRoute("/library", "/library", false), false);
	});
});
