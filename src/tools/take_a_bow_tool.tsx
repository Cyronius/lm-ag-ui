// AutoScreenHeartRed.tsx
import React, { useEffect, useRef } from "react";

/**
 * Auto-starts on mount:
 * 1) Screenshots the FULL PAGE to a canvas overlay above everything.
 * 2) Splits the screenshot into tiles and animates them into a heart shape.
 * 3) Tiles gain a subtle red tint as they converge; heart holds, then fades out.
 * Press Escape to cancel.
 */
export default function AutoScreenHeartRed() {
    const runningRef = useRef(false);
    const overlayRef = useRef<HTMLCanvasElement | null>(null);
    const srcRef = useRef<HTMLCanvasElement | null>(null);
    const frameRef = useRef<number | null>(null);
    const onEscRef = useRef<((e: KeyboardEvent) => void) | null>(null);
    const originalOverflowRef = useRef<{ html: string; body: string } | null>(null);

    useEffect(() => {
        // Timings
        const MOVE_MS = 2200;
        const HOLD_MS = 1400;
        const FADE_MS = 700;

        // Look & perf
        const Z = 2147483647;
        const MAX_DIM = 4600;       // cap the longer page dimension (device pixels)
        const TILE_TARGET = 3800;   // approximate number of tiles
        const RED_MAX_ALPHA = 0.35; // strongest tint when tiles fully converged

        const easeInOutCubic = (t: number) =>
            t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

        const cancel = () => {
            if (!runningRef.current) return;
            runningRef.current = false;

            if (onEscRef.current) {
                window.removeEventListener("keydown", onEscRef.current);
                onEscRef.current = null;
            }
            if (frameRef.current != null) {
                cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }

            const overlay = overlayRef.current;
            if (overlay) {
                overlay.style.transition = "opacity 280ms ease-out";
                overlay.style.opacity = "0";
                const toRemove = overlay;
                setTimeout(() => toRemove.remove(), 320);
            }
            const src = srcRef.current;
            if (src) src.remove();
            overlayRef.current = null;
            srcRef.current = null;

            if (originalOverflowRef.current) {
                document.documentElement.style.overflow = originalOverflowRef.current.html;
                document.body.style.overflow = originalOverflowRef.current.body;
                originalOverflowRef.current = null;
            }
        };

        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") cancel();
        };

        const start = async () => {
            if (typeof window === "undefined" || !document?.body) return;
            if (runningRef.current) return;
            runningRef.current = true;

            onEscRef.current = onEsc;
            window.addEventListener("keydown", onEsc, { passive: true });

            // Freeze scroll
            originalOverflowRef.current = {
                html: document.documentElement.style.overflow || "",
                body: document.body.style.overflow || "",
            };
            document.documentElement.style.overflow = "hidden";
            document.body.style.overflow = "hidden";

            // Lazy-load html2canvas
            let html2canvas: any;
            try {
                const mod = await import("html2canvas");
                html2canvas = mod.default || mod;
            } catch (e) {
                console.error("Failed to load html2canvas:", e);
                cancel();
                return;
            }

            // Full-page dimensions
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

            // Render scale (cap)
            const dpr = Math.max(1, window.devicePixelRatio || 1);
            const scale = Math.min(dpr, MAX_DIM / Math.max(pageW, pageH));

            // Overlay
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
                zIndex: String(Z),
                transform: "translateZ(0)",
                willChange: "opacity, transform",
            });
            document.body.appendChild(overlay);
            overlayRef.current = overlay;
            const ctx = overlay.getContext("2d");
            if (!ctx) {
                cancel();
                return;
            }
            ctx.imageSmoothingEnabled = true;

            // Screenshot
            let shot: HTMLCanvasElement;
            try {
                shot = await html2canvas(document.body, {
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
                cancel();
                return;
            }

            // Source buffer
            const src = document.createElement("canvas");
            src.width = overlay.width;
            src.height = overlay.height;
            srcRef.current = src;
            const sctx = src.getContext("2d");
            if (!sctx) {
                cancel();
                return;
            }
            sctx.drawImage(shot, 0, 0, src.width, src.height);

            // Tiles
            const area = overlay.width * overlay.height;
            const approxTileArea = Math.max(1, Math.floor(area / TILE_TARGET));
            let tileSize = Math.max(6, Math.floor(Math.sqrt(approxTileArea)));
            tileSize = Math.min(tileSize, 64);

            const cols = Math.max(1, Math.floor(overlay.width / tileSize));
            const rows = Math.max(1, Math.floor(overlay.height / tileSize));
            const tileW = Math.ceil(overlay.width / cols);
            const tileH = Math.ceil(overlay.height / rows);

            type Tile = {
                sx: number;
                sy: number;
                x0: number;
                y0: number;
                tx: number;
                ty: number;
                jitterX: number;
                jitterY: number;
                delay: number;
            };

            const tiles: Tile[] = [];
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const sx = c * tileW;
                    const sy = r * tileH;
                    tiles.push({
                        sx,
                        sy,
                        x0: sx,
                        y0: sy,
                        tx: 0,
                        ty: 0,
                        jitterX: (Math.random() - 0.5) * tileW * 0.12,
                        jitterY: (Math.random() - 0.5) * tileH * 0.12,
                        delay: Math.random() * 220,
                    });
                }
            }

            // Heart target points


            const cx = overlay.width / 2;
            // Put center a bit ABOVE the middle so the *bottom* tip has room on screen.
            // (Canvas Y grows downward.)
            const cy = overlay.height * 0.46;
            const S = Math.min(overlay.width, overlay.height) * 0.30; // overall size

            const CLEFTHOOK = 0.10;  // 0..0.35: deepen top indentation
            const TIP_ANCHORS = Math.max(8, Math.floor(tiles.length * 0.003)); // ensure a crisp tip

            const clampX = (x: number) =>
                Math.min(Math.max(x, tileW / 2), overlay.width - tileW / 2);
            const clampY = (y: number) =>
                Math.min(Math.max(y, tileH / 2), overlay.height - tileH / 2);

            const targets: { x: number; y: number }[] = [];

            // 1) Pin a few tiles right at the bottom tip for a clear point.
            for (let i = 0; i < TIP_ANCHORS; i++) {
                const jitterX = (Math.random() - 0.5) * tileW * 0.35;
                const jitterY = Math.random() * tileH * 0.25; // slight upward jitter
                const x = clampX(cx + jitterX);
                // Math-space tip is at (0, -1). Map to canvas: y = cy - (ym * S).
                const y = clampY(cy - (-1 * S) + jitterY); // near the bottom tip
                targets.push({ x, y });
            }

            // 2) Fill the rest by sampling the implicit heart:
            // (x^2 + y^2 - 1)^3 - x^2 y^3 <= 0   with x,y in roughly [-1.3, 1.3]
            while (targets.length < tiles.length) {
                const rx = Math.random() * 2.6 - 1.3;
                const ry = Math.random() * 2.6 - 1.3;

                // inside heart?
                const v = (rx * rx + ry * ry - 1) ** 3 - (rx * rx) * (ry ** 3);
                if (v > 0) continue;

                let xm = rx;
                let ym = ry;

                // Deepen the top cleft: pull points near x≈0 upward when y>0 (math y-up).
                if (ym > 0) {
                    const cleft = CLEFTHOOK * (1 - Math.pow(Math.abs(xm), 1.5));
                    ym += cleft;
                }

                const x = clampX(cx + xm * S);
                const y = clampY(cy - ym * S); // canvas y-down

                targets.push({ x, y });
            }

            // (Optional) keep angle sort just for a pleasing motion path; it doesn't define the shape.
            const angle = (x: number, y: number) => Math.atan2(y - cy, x - cx);
            tiles.sort(
                (a, b) =>
                    angle(a.x0 + tileW / 2, a.y0 + tileH / 2) -
                    angle(b.x0 + tileW / 2, b.y0 + tileH / 2)
            );
            targets.sort((a, b) => angle(a.x, a.y) - angle(b.x, b.y));

            // Assign targets
            for (let i = 0; i < tiles.length; i++) {
                tiles[i].tx = targets[i].x;
                tiles[i].ty = targets[i].y;
            }

            const t0 = performance.now();

            const draw = (now: number) => {
                if (!runningRef.current) return;

                const elapsed = now - t0;

                // Global alpha (for fade-out at the very end)
                let globalAlpha = 1;
                if (elapsed > MOVE_MS + HOLD_MS) {
                    const f = clamp01((elapsed - MOVE_MS - HOLD_MS) / FADE_MS);
                    globalAlpha = 1 - f;
                }

                ctx.clearRect(0, 0, overlay.width, overlay.height);

                for (let i = 0; i < tiles.length; i++) {
                    const tile = tiles[i];
                    const { sx, sy, x0, y0, tx, ty, delay, jitterX, jitterY } = tile;

                    // Per-tile progress 0..1 over the move phase
                    const moveT = clamp01((elapsed - delay) / MOVE_MS);
                    const k = easeInOutCubic(moveT);

                    // Target top-left (center on tx, ty)
                    const targetLeft = tx - tileW / 2;
                    const targetTop = ty - tileH / 2;

                    // Position
                    let x: number;
                    let y: number;

                    if (elapsed <= delay) {
                        x = x0;
                        y = y0;
                    } else if (elapsed <= delay + MOVE_MS) {
                        const wobble = Math.sin((moveT + i * 0.13) * Math.PI * 2) * 0.08;
                        x = x0 + (targetLeft - x0) * (k + wobble * (1 - k)) + jitterX * (1 - k);
                        y = y0 + (targetTop - y0) * (k + wobble * (1 - k)) + jitterY * (1 - k);
                    } else {
                        x = targetLeft;
                        y = targetTop;
                    }

                    // Draw the tile image
                    ctx.globalAlpha = globalAlpha;
                    ctx.drawImage(src, sx, sy, tileW, tileH, x, y, tileW, tileH);

                    // Red tint that increases as the tile progresses (and is full during hold)
                    const inHold = elapsed > delay + MOVE_MS;
                    const redPhase = inHold ? 1 : moveT;           // 0..1
                    const redStrength = Math.pow(redPhase, 1.5);   // ease emphasis
                    const tintAlpha = RED_MAX_ALPHA * redStrength * globalAlpha;

                    if (tintAlpha > 0.001) {
                        ctx.save();
                        ctx.globalAlpha = tintAlpha;
                        ctx.fillStyle = "rgba(255,0,0,1)";
                        // Use source-over with partial alpha to tint only the tile area we just drew
                        ctx.fillRect(x, y, tileW, tileH);
                        ctx.restore();
                    }
                }

                if (elapsed >= MOVE_MS + HOLD_MS + FADE_MS) {
                    cancel();
                    return;
                }
                frameRef.current = requestAnimationFrame(draw);
            };

            frameRef.current = requestAnimationFrame(draw);
        };

        start().catch(() => cancel());
        return () => cancel();
    }, []);

    return null;
}
