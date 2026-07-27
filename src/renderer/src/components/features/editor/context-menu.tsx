import type { ContextMenuState } from "@/components/features/editor/utils/types";
import { Button } from "@/components/ui";
import { useTranslation } from "@/translations/translation-context";
import { Copy, ExternalLink, Pencil, RefreshCcw } from "lucide-react";
import { type KeyboardEvent, type MouseEvent, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface ContextMenuProps {
	state: ContextMenuState;
	onCopyPath: () => void;
	onOpenFolder: () => void;
	onReloadFile: () => void;
	onRename: () => void;
	onDelete: () => void;
	onClose: () => void;
}

const ContextMenu = ({
	state,
	onCopyPath,
	onOpenFolder,
	onReloadFile,
	onRename,
	onDelete,
	onClose,
}: ContextMenuProps) => {
	const { t } = useTranslation();
	const menuRef = useRef<HTMLDivElement>(null);
	const previouslyFocusedRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		if (!state.visible) return;
		previouslyFocusedRef.current = document.activeElement as HTMLElement;
		menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
		return () => previouslyFocusedRef.current?.focus();
	}, [state.visible]);

	if (!state.visible || !state.node) return null;

	const handleClick = (
		event: MouseEvent<HTMLButtonElement>,
		action: () => void,
	) => {
		event.stopPropagation();
		action();
		onClose();
	};

	const isDirectory = state.node.type === "directory";
	const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		const items = Array.from(
			menuRef.current?.querySelectorAll<HTMLButtonElement>(
				"button:not([disabled])",
			) ?? [],
		);
		const index = items.indexOf(document.activeElement as HTMLButtonElement);
		if (event.key === "Escape" || event.key === "Tab") {
			event.preventDefault();
			onClose();
		}
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			const offset = event.key === "ArrowDown" ? 1 : -1;
			items[(index + offset + items.length) % items.length]?.focus();
		} else if (event.key === "Home" || event.key === "End") {
			event.preventDefault();
			items[event.key === "Home" ? 0 : items.length - 1]?.focus();
		}
	};

	const menu = (
		<div
			ref={menuRef}
			role="menu"
			aria-label="File actions"
			onKeyDown={handleMenuKeyDown}
			className="fixed z-50 rounded-xl border border-white/10 bg-neutral-900/95 p-2 text-sm text-neutral-200 shadow-lg"
			onClick={(event) => event.stopPropagation()}
			style={{
				top: state.y,
				left: state.x,
				minWidth: 160,
			}}
		>
			<Button
				role="menuitem"
				variant="ghost"
				size="sm"
				className="w-full justify-start gap-2"
				onClick={(event) => handleClick(event, onCopyPath)}
			>
				<Copy className="h-4 w-4" />
				<span>{t("contextMenu.copyPath")}</span>
			</Button>

			{isDirectory ? (
				<Button
					role="menuitem"
					variant="ghost"
					size="sm"
					className="w-full justify-start gap-2"
					onClick={(event) => handleClick(event, onOpenFolder)}
				>
					<ExternalLink className="h-4 w-4" />
					<span>{t("contextMenu.open")}</span>
				</Button>
			) : (
				<Button
					role="menuitem"
					variant="ghost"
					size="sm"
					className="w-full justify-start gap-2"
					onClick={(event) => handleClick(event, onReloadFile)}
				>
					<RefreshCcw className="h-4 w-4" />
					<span>{t("contextMenu.reload")}</span>
				</Button>
			)}

			<Button
				role="menuitem"
				variant="ghost"
				size="sm"
				className="w-full justify-start gap-2"
				onClick={(event) => handleClick(event, onRename)}
			>
				<Pencil className="h-4 w-4" />
				<span>{t("contextMenu.rename")}</span>
			</Button>

			<Button
				role="menuitem"
				variant="ghost"
				size="sm"
				className="w-full justify-start gap-2 text-rose-400"
				onClick={(event) => handleClick(event, onDelete)}
			>
				<span>{t("contextMenu.delete")}</span>
			</Button>
		</div>
	);

	return createPortal(menu, document.body);
};

export default ContextMenu;
