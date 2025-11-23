export function initStars() {
    const canvas = document.createElement("canvas");
    canvas.id = "stars-canvas";
    canvas.style.position = "fixed";
    canvas.style.top = 0;
    canvas.style.left = 0;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.zIndex = -1;
    canvas.style.pointerEvents = "none";
  
    document.body.appendChild(canvas);
  
    const ctx = canvas.getContext("2d");
  
    function resize() {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    }
    resize();
    window.addEventListener("resize", resize);
  
    const stars = Array.from({ length: 160 }).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.2,
      s: Math.random() * 0.6 + 0.2,
    }));
  
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
  
      for (const star of stars) {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${star.s})`;
        ctx.fill();
  
        star.y += star.s * 0.15;
        if (star.y > canvas.height) star.y = 0;
      }
  
      requestAnimationFrame(draw);
    }
  
    draw();
  }
  