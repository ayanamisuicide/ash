import { motion, useReducedMotion } from 'framer-motion';

const NOISE_TEXTURE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")";

const blobs = [
  {
    className: 'left-[-14%] top-[-16%] h-[36rem] w-[36rem] bg-accent/[0.20]',
    duration: 24,
    x: [0, 50, -20, 0],
    y: [0, 40, 70, 0],
    scale: [1, 1.12, 0.96, 1],
  },
  {
    className: 'right-[-18%] top-[8%] h-[32rem] w-[32rem] bg-info/[0.14]',
    duration: 30,
    x: [0, -60, 20, 0],
    y: [0, 60, -20, 0],
    scale: [1, 0.94, 1.14, 1],
  },
  {
    className: 'bottom-[-22%] left-[28%] h-[34rem] w-[34rem] bg-success/[0.08]',
    duration: 34,
    x: [0, 70, -30, 0],
    y: [0, -50, 20, 0],
    scale: [1, 1.1, 0.95, 1],
  },
  {
    className: 'bottom-[6%] right-[-10%] h-[28rem] w-[28rem] bg-premium/[0.10]',
    duration: 28,
    x: [0, -34, 26, 0],
    y: [0, -44, 18, 0],
    scale: [1, 1.08, 0.94, 1],
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
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(102,115,255,0.10),transparent_55%)]" />

      <motion.div
        className="absolute left-1/2 top-[40%] h-[46rem] w-[46rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.06] blur-[120px]"
        style={{
          background: 'conic-gradient(from 120deg, #6673ff, #54b8ff, #b388ff, #3dd68c, #6673ff)',
        }}
        animate={reduceMotion ? undefined : { opacity: [0.05, 0.09, 0.05], scale: [1, 1.08, 1] }}
        transition={{ duration: 20, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
      />

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

      <div className="absolute inset-0 animate-grid-drift bg-grid bg-grid-56 mask-radial opacity-50" />
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-soft-light"
        style={{ backgroundImage: NOISE_TEXTURE }}
      />
      <div className="absolute inset-x-0 top-0 h-px animate-pulse-soft bg-gradient-to-r from-transparent via-white/[0.12] to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(8,9,13,0.55)_100%)]" />
    </div>
  );
}
