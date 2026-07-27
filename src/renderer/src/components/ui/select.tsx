import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";

export interface SelectOption {
	value: string;
	label: string;
	icon?: React.ReactNode;
	disabled?: boolean;
}

interface SelectProps {
	value: string;
	onChange: (value: string) => void;
	options: SelectOption[];
	placeholder?: string;
	className?: string;
	width?: string;
	disabled?: boolean;
	showCheckmark?: boolean;
	"aria-label"?: string;
	"aria-labelledby"?: string;
	"aria-describedby"?: string;
}

export default function Select({
	value,
	onChange,
	options,
	placeholder = "Select...",
	className = "",
	width = "w-44",
	disabled = false,
	showCheckmark = true,
	"aria-label": ariaLabel = "Select an option",
	"aria-labelledby": ariaLabelledBy,
	"aria-describedby": ariaDescribedBy,
}: SelectProps) {
	const [isOpen, setIsOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const listboxId = useId();
	const focusTrigger = () =>
		requestAnimationFrame(() => triggerRef.current?.focus());
	const focusOption = (position: "first" | "last") => {
		requestAnimationFrame(() => {
			const items = containerRef.current?.querySelectorAll<HTMLButtonElement>(
				'[role="option"]:not([disabled])',
			);
			if (!items?.length) return;
			items[position === "last" ? items.length - 1 : 0].focus();
		});
	};
	const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
		if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
		event.preventDefault();
		setIsOpen(true);
		focusOption(
			event.key === "ArrowUp" || event.key === "End" ? "last" : "first",
		);
	};

	// Close dropdown on click outside or ESC
	useEffect(() => {
		if (!isOpen) return;

		const handleDocumentMouseDown = (event: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(event.target as Node)
			) {
				setIsOpen(false);
			}
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setIsOpen(false);
				focusTrigger();
			}
		};

		document.addEventListener("mousedown", handleDocumentMouseDown);
		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.removeEventListener("mousedown", handleDocumentMouseDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [isOpen]);

	const selectedOption = options.find((opt) => opt.value === value);

	return (
		<div ref={containerRef} className={`relative ${className}`}>
			<button
				ref={triggerRef}
				type="button"
				role="combobox"
				aria-label={ariaLabelledBy ? undefined : ariaLabel}
				aria-labelledby={ariaLabelledBy}
				aria-describedby={ariaDescribedBy}
				aria-expanded={isOpen}
				aria-controls={listboxId}
				aria-haspopup="listbox"
				onKeyDown={handleKeyDown}
				onClick={() => !disabled && setIsOpen(!isOpen)}
				disabled={disabled}
				className={`${width} bg-white/10 border text-left border-white/5 text-neutral-200 h-10 px-4 rounded-xl text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 hover:bg-white/20 cursor-pointer flex items-center justify-between transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed`}
			>
				<span className="flex items-center gap-2 truncate">
					{selectedOption?.icon}
					{selectedOption?.label || placeholder}
				</span>
				<motion.div
					animate={{ rotate: isOpen ? 180 : 0 }}
					transition={{ duration: 0.15 }}
					className="ml-2 shrink-0"
				>
					<ChevronDown className="w-4 h-4" />
				</motion.div>
			</button>

			<AnimatePresence>
				{isOpen && (
					<motion.div
						id={listboxId}
						role="listbox"
						key="dropdown"
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 5 }}
						exit={{ opacity: 0, y: 10, filter: "blur(10px)" }}
						transition={{ duration: 0.15 }}
						className={`${width} backdrop-blur-md backdrop-filter absolute z-50 mt-1 p-2 rounded-xl border border-white/5 shadow-lg bg-[#2e2d32]/90 max-h-64 overflow-y-auto`}
					>
						<div className="flex flex-col gap-1">
							{options.map((option) => {
								const isSelected = option.value === value;
								const isDisabled = option.disabled;

								return (
									<button
										type="button"
										role="option"
										aria-selected={isSelected}
										onKeyDown={(event) => {
											if (event.key === "Escape") {
												setIsOpen(false);
												focusTrigger();
											} else if (
												event.key === "ArrowDown" ||
												event.key === "ArrowUp"
											) {
												event.preventDefault();
												const items = Array.from(
													containerRef.current?.querySelectorAll<HTMLButtonElement>(
														'[role="option"]:not([disabled])',
													) ?? [],
												);
												const index = items.indexOf(event.currentTarget);
												items[
													(index +
														(event.key === "ArrowDown" ? 1 : -1) +
														items.length) %
														items.length
												]?.focus();
											} else if (event.key === "Home" || event.key === "End") {
												event.preventDefault();
												focusOption(event.key === "Home" ? "first" : "last");
											}
										}}
										key={option.value}
										onClick={() => {
											if (!isDisabled) {
												onChange(option.value);
												setIsOpen(false);
												focusTrigger();
											}
										}}
										disabled={isDisabled}
										className={`w-full text-left rounded-xl px-4 py-2 text-sm transition-colors duration-200 flex items-center justify-between gap-2
											${
												isDisabled
													? "opacity-50 cursor-not-allowed"
													: isSelected
														? "bg-white/20 text-white"
														: "hover:bg-white/20 cursor-pointer text-neutral-300 hover:text-white"
											}`}
									>
										<span className="flex items-center gap-2 truncate">
											{option.icon}
											{option.label}
										</span>
										{showCheckmark && isSelected && (
											<Check className="w-4 h-4 shrink-0" />
										)}
									</button>
								);
							})}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

interface MultiSelectProps extends Omit<SelectProps, "value" | "onChange"> {
	value: string[];
	onChange: (value: string[]) => void;
	maxSelections?: number;
}

export function MultiSelect({
	value,
	onChange,
	options,
	placeholder = "Select...",
	className = "",
	width = "w-44",
	disabled = false,
	maxSelections,
	"aria-label": ariaLabel = "Select one or more options",
	"aria-labelledby": ariaLabelledBy,
	"aria-describedby": ariaDescribedBy,
}: MultiSelectProps) {
	const [isOpen, setIsOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const listboxId = useId();
	const focusTrigger = () =>
		requestAnimationFrame(() => triggerRef.current?.focus());
	const focusOption = (position: "first" | "last") => {
		requestAnimationFrame(() => {
			const items = containerRef.current?.querySelectorAll<HTMLButtonElement>(
				'[role="option"]:not([disabled])',
			);
			if (!items?.length) return;
			items[position === "last" ? items.length - 1 : 0].focus();
		});
	};
	const handleTriggerKeyDown = (
		event: ReactKeyboardEvent<HTMLButtonElement>,
	) => {
		if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
		event.preventDefault();
		setIsOpen(true);
		focusOption(
			event.key === "ArrowUp" || event.key === "End" ? "last" : "first",
		);
	};

	useEffect(() => {
		if (!isOpen) return;

		const handleDocumentMouseDown = (event: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(event.target as Node)
			) {
				setIsOpen(false);
			}
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setIsOpen(false);
				focusTrigger();
			}
		};

		document.addEventListener("mousedown", handleDocumentMouseDown);
		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.removeEventListener("mousedown", handleDocumentMouseDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [isOpen]);

	const selectedLabels = value
		.map((v) => options.find((opt) => opt.value === v)?.label)
		.filter(Boolean)
		.join(", ");

	const handleToggle = (optionValue: string) => {
		if (value.includes(optionValue)) {
			onChange(value.filter((v) => v !== optionValue));
		} else {
			if (maxSelections && value.length >= maxSelections) return;
			onChange([...value, optionValue]);
		}
	};

	return (
		<div ref={containerRef} className={`relative ${className}`}>
			<button
				ref={triggerRef}
				type="button"
				role="combobox"
				aria-label={ariaLabelledBy ? undefined : ariaLabel}
				aria-labelledby={ariaLabelledBy}
				aria-describedby={ariaDescribedBy}
				aria-expanded={isOpen}
				aria-controls={listboxId}
				aria-haspopup="listbox"
				onKeyDown={handleTriggerKeyDown}
				onClick={() => !disabled && setIsOpen(!isOpen)}
				disabled={disabled}
				className={`${width} bg-white/10 border text-left border-white/5 text-neutral-200 h-10 px-4 rounded-xl text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 hover:bg-white/20 cursor-pointer flex items-center justify-between transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed`}
			>
				<span className="truncate">
					{selectedLabels || placeholder}
					{value.length > 0 && ` (${value.length})`}
				</span>
				<motion.div
					animate={{ rotate: isOpen ? 180 : 0 }}
					transition={{ duration: 0.15 }}
					className="ml-2 shrink-0"
				>
					<ChevronDown className="w-4 h-4" />
				</motion.div>
			</button>

			<AnimatePresence>
				{isOpen && (
					<motion.div
						id={listboxId}
						role="listbox"
						aria-multiselectable="true"
						key="dropdown"
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 5 }}
						exit={{ opacity: 0, y: 10, filter: "blur(10px)" }}
						transition={{ duration: 0.15 }}
						className={`${width} backdrop-blur-md backdrop-filter absolute z-50 mt-1 p-2 rounded-xl border border-white/5 shadow-lg bg-[#2e2d32]/90 max-h-64 overflow-y-auto`}
					>
						<div className="flex flex-col gap-1">
							{options.map((option) => {
								const isSelected = value.includes(option.value);
								const isDisabled =
									option.disabled ||
									(!isSelected &&
										maxSelections !== undefined &&
										value.length >= maxSelections);

								return (
									<button
										type="button"
										role="option"
										aria-selected={isSelected}
										key={option.value}
										onKeyDown={(event) => {
											if (event.key === "Escape") {
												setIsOpen(false);
												focusTrigger();
											} else if (
												event.key === "ArrowDown" ||
												event.key === "ArrowUp"
											) {
												event.preventDefault();
												const items = Array.from(
													containerRef.current?.querySelectorAll<HTMLButtonElement>(
														'[role="option"]:not([disabled])',
													) ?? [],
												);
												const index = items.indexOf(event.currentTarget);
												items[
													(index +
														(event.key === "ArrowDown" ? 1 : -1) +
														items.length) %
														items.length
												]?.focus();
											} else if (event.key === "Home" || event.key === "End") {
												event.preventDefault();
												focusOption(event.key === "Home" ? "first" : "last");
											}
										}}
										onClick={() => !isDisabled && handleToggle(option.value)}
										disabled={isDisabled}
										className={`w-full text-left rounded-xl px-4 py-2 text-sm transition-colors duration-200 flex items-center justify-between gap-2
											${
												isDisabled
													? "opacity-50 cursor-not-allowed"
													: isSelected
														? "bg-white/20 text-white"
														: "hover:bg-white/20 cursor-pointer text-neutral-300 hover:text-white"
											}`}
									>
										<span className="flex items-center gap-2 truncate">
											{option.icon}
											{option.label}
										</span>
										{isSelected && <Check className="w-4 h-4 shrink-0" />}
									</button>
								);
							})}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
