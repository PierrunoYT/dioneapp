import { cloneElement, isValidElement, useId } from "react";

interface SettingItemProps {
	label: string;
	description: string;
	children: React.ReactNode;
	layout?: "row" | "column";
}

export default function SettingItem({
	label,
	description,
	children,
	layout = "row",
}: SettingItemProps) {
	const id = useId();
	const labelId = `${id}-label`;
	const descriptionId = `${id}-description`;
	const control = isValidElement<Record<string, unknown>>(children)
		? cloneElement(children, {
				"aria-labelledby": labelId,
				"aria-describedby": descriptionId,
			})
		: children;

	if (layout === "column") {
		return (
			<div className="flex flex-col gap-3 w-full">
				<div className="flex items-start justify-center flex-col">
					<span id={labelId} className="text-neutral-200 font-medium">
						{label}
					</span>
					<p id={descriptionId} className="text-xs text-neutral-400 max-w-xl">
						{description}
					</p>
				</div>
				{control}
			</div>
		);
	}

	return (
		<div className="flex justify-between w-full items-center">
			<div className="flex items-start justify-center flex-col">
				<span id={labelId} className="text-neutral-200 font-medium">
					{label}
				</span>
				<p id={descriptionId} className="text-xs text-neutral-400 max-w-xl">
					{description}
				</p>
			</div>
			{control}
		</div>
	);
}
