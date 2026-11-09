import { motion, useReducedMotion } from 'framer-motion';

const blobs = [
  {
    className: 'left-[-14%] top-[-16%] h-[34rem] w-[34rem] bg-accent/[0.16]',
    duration: 24,
    x: [0, 50, -20, 0],
    y: [0, 40, 70, 0],
    scale: [1, 1.12, 0.96, 1],
  },
  {
    className: 'right-[-18%] top-[8%] h-[30rem] w-[30rem] bg-info/[0.11]',
    duration: 30,
    x: [0, -60, 20, 0],
    y: [0, 60, -20, 0],
    scale: [1, 0.94, 1.14, 1],
  },
  {
    className: 'bottom-[-22%] left-[28%] h-[32rem] w-[32rem] bg-success/[0.06]',
    duration: 34,
    x: [0, 70, -30, 0],
    y: [0, -50, 20, 0],
    scale: [1, 1.1, 0.95, 1],
  },
] as const;

/**
 * Единый атмосферный слой приложения.
 * Намеренно fixed и pointer-events-none: не влияет на layout и клики.
 */
export function BackgroundFx() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(102,115,255,0.08),transparent_55%)]" />

      {blobs.map((blob, index) => (
        <motion.div
          key={index}
          className={`absolute rounded-full blur-[120px] ${blob.className}`}
          animate={
            reduceMotion
              ? undefined
              : {
                  x: [...blob.x],
                  y: [...blob.y],
                  scale: [...blob.scale],
                }
          }
          transition={{
            duration: blob.duration,
            repeat: Infinity,
            repeatType: 'mirror',
            ease: 'easeInOut',
          }}
        />
      ))}

      <div className="absolute inset-0 bg-grid bg-grid-56 mask-radial opacity-40" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(8,9,13,0.55)_100%)]" />
    </div>
  );
}
