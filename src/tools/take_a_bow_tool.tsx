// AutoScreenMelt.tsx
import React, { useEffect, useRef } from "react";

// Minimal, no-ref component. Starts on mount. Press Escape to cancel.
// Captures the FULL PAGE (not just the viewport) and melts it.
export default function AutoScreenMelt() {
    const runningRef = useRef(false);
    const overlayRef = useRef<HTMLCanvasElement | null>(null);
    const offscreenRef = useRef<HTMLCanvasElement | null>(null);
    const frameIdRef = useRef<number | null>(null);
    const originalOverflowRef = useRef<string | null>(null);

    useEffect(() => {
        let canceled = false;

        const durationMs = 7000;
        const columns = 160;
        const gravity = 0.15;
        const maxJitter = 0.6;
        const easeOutAt = 0.85;
        const zIndex = 2147483647;

        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") cancel();
        };

        const cleanup = () => {
            window.removeEventListener("keydown", onEsc);
            if (frameIdRef.current != null) {
                cancelAnimationFrame(frameIdRef.current);
                frameIdRef.current = null;
            }
            const overlay = overlayRef.current;
            const offscreen = offscreenRef.current;
            if (overlay) {
                overlay.style.transition = "opacity 300ms ease-out";
                overlay.style.opacity = "0";
                const toRemove = overlay;
                setTimeout(() => toRemove.remove(), 320);
            }
            if (offscreen) offscreen.remove();
            overlayRef.current = null;
            offscreenRef.current = null;
            runningRef.current = false;
            if (originalOverflowRef.current !== null) {
                document.documentElement.style.overflow = originalOverflowRef.current;
                document.body.style.overflow = originalOverflowRef.current;
                originalOverflowRef.current = null;
            }
        };

        const cancel = () => {
            if (!runningRef.current) return;
            cleanup();
        };

        const start = async () => {
            if (typeof window === "undefined" || !document?.body) return;
            if (runningRef.current) return;
            runningRef.current = true;

            window.addEventListener("keydown", onEsc);

            // Prevent page from scrolling during the effect
            originalOverflowRef.current = document.documentElement.style.overflow || "";
            document.documentElement.style.overflow = "hidden";
            document.body.style.overflow = "hidden";

            // Lazy load html2canvas
            let html2canvas: any;
            try {
                const mod = await import("html2canvas");
                html2canvas = mod.default || mod;
            } catch (e) {
                console.error("Failed to load html2canvas:", e);
                cleanup();
                return;
            }

            // Full page dimensions
            const pageW = Math.max(
                document.documentElement.scrollWidth,
                document.body.scrollWidth,
                document.documentElement.clientWidth,
                window.innerWidth || 0
            );
            const pageH = Math.max(
                document.documentElement.scrollHeight,
                document.body.scrollHeight,
                document.documentElement.clientHeight,
                window.innerHeight || 0
            );

            // Render scale: cap giant pages to keep memory sane
            const dpr = Math.max(1, window.devicePixelRatio || 1);
            const MAX_DIM = 4096; // pixel cap on the longer edge (feel free to raise on powerful machines)
            const scale = Math.min(dpr, MAX_DIM / Math.max(pageW, pageH));

            // Create overlay that spans the whole page, sits above everything
            const overlay = document.createElement("canvas");
            overlay.width = Math.floor(pageW * scale);
            overlay.height = Math.floor(pageH * scale);
            Object.assign(overlay.style, {
                position: "absolute",
                top: "0",
                left: "0",
                width: `${pageW}px`,
                height: `${pageH}px`,
                pointerEvents: "none",
                zIndex: String(zIndex),
                transform: "translateZ(0)",
                willChange: "opacity, transform",
            });
            document.body.appendChild(overlay);
            overlayRef.current = overlay;

            const ctx = overlay.getContext("2d");
            if (!ctx) {
                cleanup();
                return;
            }

            // Take a full-page raster (from the top-left)
            let screenshot: HTMLCanvasElement;
            try {
                screenshot = await html2canvas(document.body, {
                    x: 0,
                    y: 0,
                    width: pageW,
                    height: pageH,
                    windowWidth: pageW,
                    windowHeight: pageH,
                    scrollX: -window.scrollX,
                    scrollY: -window.scrollY,
                    backgroundColor: null,
                    scale,
                    useCORS: true,
                    logging: false,
                });
            } catch (e) {
                console.error("html2canvas failed:", e);
                cleanup();
                return;
            }

            // Offscreen source buffer at device scale
            const src = document.createElement("canvas");
            src.width = overlay.width;
            src.height = overlay.height;
            offscreenRef.current = src;

            const sctx = src.getContext("2d");
            if (!sctx) {
                cleanup();
                return;
            }
            sctx.drawImage(screenshot, 0, 0, src.width, src.height);

            ctx.imageSmoothingEnabled = true;

            // Prepare melt columns
            const colWidth = Math.ceil(src.width / columns);
            const colCount = Math.ceil(src.width / colWidth);
            const cols = new Array(colCount).fill(0).map((_, i) => {
                const startX = i * colWidth;
                const w = Math.min(colWidth, src.width - startX);
                const delay = Math.random() * 300;
                const vy0 = Math.random() * 1.5 + 0.25;
                const jitterSign = Math.random() < 0.5 ? -1 : 1;
                return { x: startX, w, yOffset: 0, vy: vy0, delay, jitterSign, done: false };
            });

            const t0 = performance.now();
            let last = t0;

            const tick = (now: number) => {
                if (!runningRef.current) return; // cancelled
                const t = now - t0;
                const dt = Math.min(33, now - last);
                last = now;

                ctx.clearRect(0, 0, overlay.width, overlay.height);

                const progress = Math.min(1, t / durationMs);
                const easingPhase = progress > easeOutAt ? (progress - easeOutAt) / (1 - easeOutAt) : 0;

                let allDone = true;

                for (let i = 0; i < colCount; i++) {
                    const c = cols[i];

                    if (t < c.delay) {
                        ctx.drawImage(src, c.x, 0, c.w, src.height, c.x, 0, c.w, src.height);
                        allDone = false;
                        continue;
                    }

                    if (!c.done) {
                        c.vy += gravity;
                        c.yOffset += c.vy;

                        const jitter = Math.random() * maxJitter * c.jitterSign;
                        c.x += jitter;
                        if (c.x < 0) c.x = 0;
                        if (c.x + c.w > src.width) c.x = src.width - c.w;

                        if (c.yOffset >= src.height * 1.1) c.done = true;
                    }

                    const stillH = Math.max(0, src.height - c.yOffset);
                    if (stillH > 0) {
                        ctx.drawImage(src, c.x, 0, c.w, stillH, c.x, 0, c.w, stillH);
                    }

                    const dripH = Math.min(src.height, c.yOffset);
                    if (dripH > 0) {
                        const sampleY = src.height - dripH;
                        ctx.drawImage(src, c.x, sampleY, c.w, dripH, c.x, c.yOffset, c.w, dripH);
                    }

                    if (!c.done) allDone = false;
                }

                ctx.globalAlpha = easingPhase > 0 ? Math.max(0, 1 - easingPhase) : 1;

                if (progress >= 1 || allDone) {
                    cleanup();
                    return;
                }
                frameIdRef.current = requestAnimationFrame(tick);
            };

            frameIdRef.current = requestAnimationFrame((n) => {
                last = n;
                tick(n);
            });
        };

        start().catch(() => cleanup());

        return () => {
            canceled = true;
            cancel();
        };
    }, []);

    return null;
}
