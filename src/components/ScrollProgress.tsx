"use client";

import { useState } from "react";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
} from "motion/react";

const SPRING = { stiffness: 120, damping: 30, restDelta: 0.001 };
const VISIBLE_THRESHOLD = 200;

export default function ScrollProgress() {
  const { scrollY, scrollYProgress } = useScroll();
  const reduceMotion = useReducedMotion();
  const springScaleX = useSpring(scrollYProgress, SPRING);
  const [visible, setVisible] = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => {
    setVisible(y > VISIBLE_THRESHOLD);
  });

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[80] h-0.5 w-full"
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="h-full w-full origin-left"
        style={{
          scaleX: reduceMotion ? scrollYProgress : springScaleX,
          backgroundColor: "var(--primary)",
        }}
      />
    </motion.div>
  );
}
