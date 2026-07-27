import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type React from "react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	title?: string;
	children: React.ReactNode;
	maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
	showCloseButton?: boolean;
	closeOnBackdropClick?: boolean;
	closeOnEscape?: boolean;
}

const maxWidthClasses = {
	sm: "max-w-sm",
	md: "max-w-md",
	lg: "max-w-lg",
	xl: "max-w-xl",
	"2xl": "max-w-2xl",
	full: "max-w-full",
};

export default function Modal({
	isOpen,
	onClose,
	title,
	children,
	maxWidth = "xl",
	showCloseButton = true,
	closeOnBackdropClick = true,
	closeOnEscape = true,
}: ModalProps) {
	const dialogRef = useRef<HTMLDivElement>(null);
	const titleId = useId();
	const previouslyFocusedRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		if (!isOpen) return;
		previouslyFocusedRef.current = document.activeElement as HTMLElement;
		const dialog = dialogRef.current;
		const selector =
			'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
		(dialog?.querySelector<HTMLElement>(selector) ?? dialog)?.focus();

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape" && closeOnEscape) {
				onClose();
			} else if (e.key === "Tab" && dialog) {
				const items = Array.from(
					dialog.querySelectorAll<HTMLElement>(selector),
				);
				if (!items.length) {
					e.preventDefault();
					dialog.focus();
				} else if (e.shiftKey && document.activeElement === items[0]) {
					e.preventDefault();
					items[items.length - 1].focus();
				} else if (
					!e.shiftKey &&
					document.activeElement === items[items.length - 1]
				) {
					e.preventDefault();
					items[0].focus();
				}
			}
		};

		document.addEventListener("keydown", handleEscape);
		return () => {
			document.removeEventListener("keydown", handleEscape);
			previouslyFocusedRef.current?.focus();
		};
	}, [isOpen, onClose, closeOnEscape]);

	const modalContent = (
		<AnimatePresence mode="wait">
			{isOpen && (
				<div className="fixed inset-0 w-full h-full z-50 flex justify-center items-center p-4">
					{/* Backdrop */}
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.2 }}
						onClick={closeOnBackdropClick ? onClose : undefined}
						className="fixed inset-0 backdrop-blur-sm bg-[#080808]/80"
					/>

					{/* Modal Content */}
					<motion.div
						ref={dialogRef}
						role="dialog"
						aria-modal="true"
						aria-labelledby={title ? titleId : undefined}
						aria-label={title ? undefined : "Dialog"}
						tabIndex={-1}
						key={`modal-${maxWidth}`}
						initial={{ opacity: 0, scale: 0.95, y: 20 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={{ opacity: 0, scale: 0.95, y: 20 }}
						transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
						className={`relative ${maxWidthClasses[maxWidth]} w-full border border-white/10 rounded-xl bg-[#080808] flex flex-col overflow-hidden mx-auto my-auto`}
					>
						{/* Header */}
						{(title || showCloseButton) && (
							<div className="px-6 pt-6 pb-2 flex items-center justify-between">
								{title && (
									<h2
										id={titleId}
										className="text-xl font-semibold text-white w-full"
									>
										{title}
									</h2>
								)}
								{showCloseButton && (
									<button
										onClick={onClose}
										className="ml-auto p-2 rounded-xl hover:bg-white/10 text-neutral-300 hover:text-white transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
										type="button"
										aria-label="Close dialog"
									>
										<X className="w-5 h-5" />
									</button>
								)}
							</div>
						)}

						{/* Body */}
						<div className="p-6 relative z-10">{children}</div>

						{/* Background effects */}
						<div className="absolute w-full h-full overflow-hidden pointer-events-none">
							<div
								className="absolute top-0 left-2/4 w-32 h-32 rounded-xl -translate-y-1/2 blur-3xl"
								style={{ backgroundColor: "var(--theme-blur)" }}
							/>
						</div>
					</motion.div>
				</div>
			)}
		</AnimatePresence>
	);

	return createPortal(modalContent, document.body);
}

interface ModalFooterProps {
	children: React.ReactNode;
	className?: string;
}

export function ModalFooter({ children, className = "" }: ModalFooterProps) {
	return (
		<div className={`mt-4 flex justify-end gap-2 ${className}`}>{children}</div>
	);
}

interface ModalBodyProps {
	children: React.ReactNode;
	className?: string;
}

export function ModalBody({ children, className = "" }: ModalBodyProps) {
	return <div className={`flex flex-col gap-4 ${className}`}>{children}</div>;
}
