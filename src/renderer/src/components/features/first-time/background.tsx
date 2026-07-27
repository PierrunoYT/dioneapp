import { motion, useReducedMotion } from "framer-motion";

export default function Background() {
	const shouldReduceMotion = useReducedMotion();
	const transition = shouldReduceMotion
		? { duration: 0 }
		: {
				duration: 30,
				repeat: Number.POSITIVE_INFINITY,
				ease: "easeInOut" as const,
			};

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{
				opacity: 0,
				transition: { duration: shouldReduceMotion ? 0 : 0.5, delay: 0 },
			}}
			transition={{
				duration: shouldReduceMotion ? 0 : 2,
				delay: shouldReduceMotion ? 0 : 0.5,
			}}
		>
			<motion.div
				className="absolute left-1/4 -top-18 w-32 h-32 rounded-xl blur-3xl z-10"
				style={{ backgroundColor: "var(--theme-accent)" }}
				animate={
					shouldReduceMotion
						? undefined
						: {
								x: [0, 200, 100, -100, 0],
								y: [0, -100, 100, 0, 0],
							}
				}
				transition={transition}
			/>
			<motion.div
				className="absolute right-1/6 -bottom-24 w-32 h-32 rounded-xl blur-3xl z-10"
				style={{ backgroundColor: "var(--theme-accent)" }}
				animate={
					shouldReduceMotion
						? undefined
						: {
								x: [0, -150, 0, 150, 0],
								y: [0, 100, -100, 50, 0],
							}
				}
				transition={{
					duration: 35,
					repeat: shouldReduceMotion ? 0 : Number.POSITIVE_INFINITY,
					ease: "easeInOut",
				}}
			/>
			<motion.div
				className="absolute -left-16 bottom-24 w-32 h-32 rounded-xl blur-3xl z-10"
				style={{ backgroundColor: "var(--theme-accent)" }}
				animate={
					shouldReduceMotion
						? undefined
						: {
								x: [0, 200, -100, 100, 0],
								y: [0, 50, -150, 100, 0],
							}
				}
				transition={{
					duration: 32,
					repeat: shouldReduceMotion ? 0 : Number.POSITIVE_INFINITY,
					ease: "easeInOut",
				}}
			/>
			<motion.div
				className="absolute -right-12 top-24 w-32 h-32 rounded-xl blur-3xl z-10"
				style={{ backgroundColor: "var(--theme-accent)" }}
				animate={
					shouldReduceMotion
						? undefined
						: {
								x: [0, -200, 100, -100, 0],
								y: [0, -50, 150, -100, 0],
							}
				}
				transition={{
					duration: 38,
					repeat: shouldReduceMotion ? 0 : Number.POSITIVE_INFINITY,
					ease: "easeInOut",
				}}
			/>
		</motion.div>
	);
}
