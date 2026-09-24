"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

type HomeEntranceProps = {
  brand: ReactNode;
  className: string;
  composer: ReactNode;
  headline: ReactNode;
  recentJourneys?: ReactNode;
};

// Cult UI Text Animate's fadeInUp variant, applied to complete Home sections
// so PixelHeading and the composer keep their own rendering and behavior.
const containerVariants = {
  hidden: {},
  visible: {
    transition: { delayChildren: 0.08, staggerChildren: 0.12 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export function HomeEntrance({
  brand,
  className,
  composer,
  headline,
  recentJourneys,
}: HomeEntranceProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      aria-labelledby="home-title"
      animate="visible"
      className={className}
      initial={reduceMotion ? false : "hidden"}
      variants={containerVariants}
    >
      <motion.div data-home-entrance-item="brand" variants={itemVariants}>
        {brand}
      </motion.div>
      <motion.div data-home-entrance-item="headline" variants={itemVariants}>
        {headline}
      </motion.div>
      <motion.div data-home-entrance-item="composer" variants={itemVariants}>
        {composer}
      </motion.div>
      {recentJourneys}
    </motion.section>
  );
}
