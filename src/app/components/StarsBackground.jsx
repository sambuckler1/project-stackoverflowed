import React, { useMemo } from "react";

function StarsBackground({
  count = 600,
  minSize = 2,
  maxSize = 5,
  minOpacity = 0.25,
  maxOpacity = 1.0,
  minTwinkle = 1,
  maxTwinkle = 7,
  colors = ["#fff", "#ffe9c4", "#d4fbff"]
}) {
  const stars = useMemo(() => {
    const arr = [];
    for (let i = 0; i < count; i++) {
      const size =
        Math.random() < 0.85
          ? minSize + Math.random() * (maxSize - minSize)
          : Math.min(
              maxSize + 1.5,
              minSize + Math.random() * (maxSize + 1.5)
            );

      const baseOpacity =
        minOpacity + Math.random() * (maxOpacity - minOpacity);

      const color = colors[Math.floor(Math.random() * colors.length)];

      arr.push({
        id: i,
        top: Math.random() * 100, // vh
        left: Math.random() * 100, // vw
        size,
        delay: Math.random() * 3,
        duration: minTwinkle + Math.random() * 2,
        baseOpacity,
        color,
      });
    }
    return arr;
  }, [
    count,
    minSize,
    maxSize,
    minOpacity,
    maxOpacity,
    minTwinkle,
    maxTwinkle,
    colors
  ]);

  return (
    <>
      <div className="stars" aria-hidden>
        {stars.map((s) => (
          <span
            key={s.id}
            className="star"
            style={{
              top: `${s.top}vh`,
              left: `${s.left}vw`,
              width: s.size,
              height: s.size,
              background: `radial-gradient(closest-side, ${s.color}, rgba(255,255,255,0.5), transparent)`,
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.duration}s`,
              ["--min"]: s.baseOpacity * 0.2,
              ["--max"]: Math.min(1, s.baseOpacity),
              boxShadow: `0 0 ${Math.max(4, s.size * 2)}px ${s.color}`,
            }}
          />
        ))}
      </div>

      <style jsx>{`
        .stars {
          position: absolute;
          inset: 0;
          overflow: hidden;
          z-index: 0;
          pointer-events: none;
        }
        .star {
          position: absolute;
          border-radius: 50%;
          animation-name: twinkle;
          animation-iteration-count: infinite;
          animation-timing-function: ease-in-out;
          will-change: opacity;
          opacity: var(--min);
        }
        @keyframes twinkle {
          0% {
            opacity: var(--min);
          }
          50% {
            opacity: var(--max);
          }
          100% {
            opacity: var(--min);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .star {
            animation: none !important;
          }
        }
      `}</style>
    </>
  );
}

export default React.memo(StarsBackground);
