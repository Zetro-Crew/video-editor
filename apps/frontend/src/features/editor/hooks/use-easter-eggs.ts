import { useEffect } from "react";

const OR_SEQ = ["o", "r", "t", "a", "u", "s"];
const SHAKE_SEQ = ["6", "7", "6", "7", "6", "7"];
const KLASSI_SEQ = ["r", "o", "n", "n", "y", "l", "e", "v", "y"];
const BARBIE_SEQ = ["b", "a", "r", "b", "i", "e"];
const SID_CLICK_COUNT = 7;
const SID_CLICK_WINDOW_MS = 2000;
const CORNER_THRESH = 8;
const GUMMY_COUNT = 30;

const DVD_COLORS = [
	"#FFE81F",
	"#ff6b6b",
	"#4bd5ee",
	"#ff69b4",
	"#00ff88",
	"#ff8c00",
	"#c084fc",
	"#ffffff",
];

const SID_STYLE = `
@keyframes __sidWalk {
  0%   { left: 110vw; }
  35%  { left: calc(50vw - 110px); }
  65%  { left: calc(50vw - 110px); }
  100% { left: -240px; }
}
#__sid_el {
  position: fixed;
  bottom: 60px;
  height: 220px;
  width: auto;
  z-index: 9997;
  pointer-events: none;
  animation: __sidWalk 8s ease-in-out forwards;
}
`;

const SHAKE_STYLE = `
@keyframes __pageShake {
  0%, 100% { transform: rotate(0deg); }
  10%  { transform: rotate(-4deg); }
  20%  { transform: rotate(4deg); }
  30%  { transform: rotate(-4deg); }
  40%  { transform: rotate(4deg); }
  50%  { transform: rotate(-4deg); }
  60%  { transform: rotate(4deg); }
  70%  { transform: rotate(-4deg); }
  80%  { transform: rotate(4deg); }
  90%  { transform: rotate(-4deg); }
}
.__shaking {
  animation: __pageShake 3s ease-in-out forwards;
  transform-origin: center center;
}
`;

const KLASSI_STYLE = `
@keyframes __klassiIn {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
@keyframes __klassiOut {
  from { transform: translateY(0); }
  to   { transform: translateY(100%); }
}
@keyframes __klassiScroll {
  from { transform: translateX(110vw); }
  to   { transform: translateX(-100%); }
}
@keyframes __klassiPulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.2; }
}
#__klassi_banner {
  position: fixed; bottom: 0; left: 0; right: 0;
  height: 68px; z-index: 9998; display: flex;
  align-items: stretch; overflow: hidden;
  animation: __klassiIn 0.4s cubic-bezier(0.22,1,0.36,1) forwards;
}
#__klassi_banner.__klassi_out {
  animation: __klassiOut 0.4s ease-in forwards;
}
#__klassi_badge {
  flex-shrink: 0; background: #cc0000; color: #fff;
  font-family: Arial,'Arial Narrow Bold',sans-serif;
  font-weight: 900; font-size: 13px; letter-spacing: 0.12em;
  text-transform: uppercase; padding: 0 22px;
  display: flex; align-items: center; gap: 10px;
}
#__klassi_dot {
  width: 11px; height: 11px; border-radius: 50%;
  background: #fff;
  animation: __klassiPulse 0.9s ease-in-out infinite;
}
#__klassi_track {
  flex: 1; background: #111; overflow: hidden;
  display: flex; align-items: center;
}
#__klassi_text {
  white-space: nowrap; will-change: transform;
  color: #FFE81F;
  font-family: 'Franklin Gothic Medium','Arial Narrow Bold',Arial,sans-serif;
  font-size: 26px; font-weight: 900; letter-spacing: 0.05em;
  animation: __klassiScroll 10s linear forwards;
}
`;

const DVD_STYLE = `
#__dvd_overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: #000;
}
#__dvd_logo {
  position: fixed;
  font-family: 'Franklin Gothic Medium', 'Arial Narrow Bold', Arial, sans-serif;
  font-size: 80px;
  font-weight: 900;
  letter-spacing: 0.08em;
  pointer-events: none;
  transition: color 0.3s ease;
  user-select: none;
}
#__dvd_finale {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FFE81F;
  font-family: 'Franklin Gothic Medium', 'Arial Narrow Bold', Arial, sans-serif;
  font-size: clamp(2rem, 5vw, 3.5rem);
  font-weight: bold;
  letter-spacing: 0.12em;
  direction: rtl;
  z-index: 10;
  opacity: 0;
  animation: __dvdFinaleFade 2s ease 0.3s forwards;
}
@keyframes __dvdFinaleFade {
  to { opacity: 1; }
}
#__dvd_confetti {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 9;
}
`;

const BARBIE_STYLE = `
@font-face {
  font-family: 'Comic Neue';
  src: url('${import.meta.env.BASE_URL}easter-eggs/comic-neue-400.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
}
@font-face {
  font-family: 'Comic Neue';
  src: url('${import.meta.env.BASE_URL}easter-eggs/comic-neue-700.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
}
@keyframes __barbieIn {
  from { transform: translateY(-100%); }
  to   { transform: translateY(0); }
}
@keyframes __barbieOut {
  from { transform: translateY(0); }
  to   { transform: translateY(-100%); }
}
@keyframes __barbieScroll {
  from { transform: translateX(110vw); }
  to   { transform: translateX(-100%); }
}
@keyframes __barbiePulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}
@keyframes __barbieGlow {
  0%, 100% { text-shadow: 0 0 8px #ff69b4, 0 0 20px #ff1493; }
  50%       { text-shadow: 0 0 16px #ff69b4, 0 0 40px #ff1493, 0 0 60px #fff; }
}
html.__barbie {
  --primary: #ff69b4;
  --primary-brand: #ff1493;
  --primary-foreground: #fff;
  --accent: #ff69b4;
  --accent-brand: #ff1493;
  --accent-foreground: #fff;
  --ring: #ff69b4;
  --sidebar-primary: #ff69b4;
  --sidebar-ring: #ff69b4;
  --background: #150b10;
  --app-main-background-color: #150b10;
  --app-sub-background-color: #2d1420;
  --app-sub-header-background-color: #1f0e17;
  --card: #2d1420;
  --background-subtle: #231118;
  --popover: #2d1420;
  --border: #cc5599;
  --input: #cc5599;
  --sidebar: #1f0e17;
  --sidebar-border: #cc5599;
}
html.__barbie * {
  font-family: 'Comic Neue', 'Comic Sans MS', 'Comic Sans', cursive !important;
}
#__barbie_banner {
  position: fixed; top: 0; left: 0; right: 0;
  height: 52px; z-index: 9998; display: flex;
  align-items: stretch; overflow: hidden;
  animation: __barbieIn 0.4s cubic-bezier(0.22,1,0.36,1) forwards;
  background: linear-gradient(90deg, #ff1493, #ff69b4, #ff1493);
}
#__barbie_banner.__barbie_out {
  animation: __barbieOut 0.4s ease-in forwards;
}
#__barbie_badge {
  flex-shrink: 0; background: #c2185b; color: #fff;
  font-family: 'Comic Neue', 'Comic Sans MS', cursive !important;
  font-weight: 700; font-size: 12px; letter-spacing: 0.15em;
  text-transform: uppercase; padding: 0 18px;
  display: flex; align-items: center; gap: 8px;
}
#__barbie_dot {
  width: 10px; height: 10px; border-radius: 50%;
  background: #fff;
  animation: __barbiePulse 0.8s ease-in-out infinite;
}
#__barbie_track {
  flex: 1; overflow: hidden; display: flex; align-items: center;
}
#__barbie_text {
  white-space: nowrap; will-change: transform;
  color: #fff;
  font-family: 'Comic Neue', 'Comic Sans MS', cursive !important;
  font-size: 20px; font-weight: 700; letter-spacing: 0.06em;
  animation: __barbieScroll 14s linear forwards;
  animation: __barbieGlow 1.5s ease-in-out infinite, __barbieScroll 14s linear forwards;
}
#__barbie_sparkles {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9996;
}
`;

const GUMMY_STYLE = `
@keyframes __gummy-pop {
  0%   { transform: scale(0) rotate(-180deg); opacity: 0; }
  60%  { transform: scale(1.3) rotate(15deg); opacity: 1; }
  80%  { transform: scale(0.9) rotate(-5deg); opacity: 1; }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}
#__gummy-q {
  position: fixed;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #4CAF50, #8BC34A);
  color: white;
  font-size: 22px;
  font-weight: 900;
  cursor: pointer;
  border: 2px solid #2E7D32;
  z-index: 99999;
  animation: __gummy-pop 0.5s cubic-bezier(0.22,1,0.36,1) forwards;
  box-shadow: 0 3px 12px rgba(0,0,0,0.6), 0 0 0 4px rgba(76,175,80,0.25);
  text-align: center;
  line-height: 32px;
  font-family: serif;
  transition: box-shadow 0.15s;
  user-select: none;
}
#__gummy-q:hover {
  box-shadow: 0 4px 20px rgba(76,175,80,0.7), 0 0 0 6px rgba(76,175,80,0.3);
}
.__gummy-bear {
  position: fixed;
  left: 0;
  top: 0;
  pointer-events: auto;
  cursor: grab;
  user-select: none;
  will-change: transform;
  z-index: 99998;
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.4));
  transition: filter 0.1s;
}
.__gummy-bear:active,
.__gummy-bear.__dragging {
  cursor: grabbing;
  filter: drop-shadow(0 8px 20px rgba(0,0,0,0.6)) brightness(1.1);
}
`;

function injectStyle(id: string, css: string): void {
	const el = document.createElement("style");
	el.id = id;
	el.textContent = css;
	document.head.appendChild(el);
}

function removeEl(id: string): void {
	document.getElementById(id)?.remove();
}

export default function useEasterEggs(): void {
	useEffect(() => {
		let dvdActive = false;
		let barbieActive = false;
		let teamBuffer: string[] = [];
		let shakeBuffer: string[] = [];
		let klassiBuffer: string[] = [];
		let barbieBuffer: string[] = [];
		let dvdFrame: number | null = null;
		let confettiFrame: number | null = null;
		let sparkleFrame: number | null = null;
		let barbieAudio: HTMLAudioElement | null = null;
		let barbieBannerTimer: ReturnType<typeof setTimeout> | null = null;
		let cornerTimeout: ReturnType<typeof setTimeout> | null = null;
		let finaleTimeout: ReturnType<typeof setTimeout> | null = null;
		const sidClickTimestamps: number[] = [];

		// Gummy Bear state
		type GummyBear = {
			el: HTMLImageElement;
			x: number;
			y: number;
			vx: number;
			vy: number;
			rotation: number;
			rotationSpeed: number;
			size: number;
			dragging: boolean;
		};

		let gummyActive = false;
		let gummyLongPressTimer: ReturnType<typeof setTimeout> | null = null;
		let gummyFrame: number | null = null;
		let gummyAudio: HTMLAudioElement | null = null;
		let gummyBears: GummyBear[] = [];
		let gummyDrag: {
			bear: GummyBear;
			ox: number;
			oy: number;
			lastX: number;
			lastY: number;
			flingVx: number;
			flingVy: number;
		} | null = null;

		function showKlassi(): void {
			if (document.getElementById("__klassi_banner")) return;
			injectStyle("__klassi_style", KLASSI_STYLE);

			const banner = document.createElement("div");
			banner.id = "__klassi_banner";

			const badge = document.createElement("div");
			badge.id = "__klassi_badge";
			const dot = document.createElement("div");
			dot.id = "__klassi_dot";
			badge.appendChild(dot);
			badge.appendChild(document.createTextNode("BREAKING NEWS"));

			const track = document.createElement("div");
			track.id = "__klassi_track";
			const text = document.createElement("div");
			text.id = "__klassi_text";
			text.textContent =
				"🔴 קלאסי רוני לוי 🔴 קלאסי רוני לוי 🔴 קלאסי רוני לוי🔴 קלאסי רוני לוי 🔴 קלאסי רוני לוי 🔴 קלאסי רוני לוי🔴 קלאסי רוני לוי 🔴 קלאסי רוני לוי 🔴 קלאסי רוני לוי";
			track.appendChild(text);

			banner.appendChild(badge);
			banner.appendChild(track);
			document.body.appendChild(banner);

			let klassiTimer: ReturnType<typeof setTimeout> | null = null;

			const dismiss = () => {
				if (klassiTimer !== null) {
					clearTimeout(klassiTimer);
					klassiTimer = null;
				}
				banner.classList.add("__klassi_out");
				banner.addEventListener(
					"animationend",
					() => {
						banner.remove();
						removeEl("__klassi_style");
					},
					{ once: true },
				);
			};

			klassiTimer = setTimeout(dismiss, 10500);
			banner.addEventListener("click", dismiss, { once: true });
		}

		function showShake(): void {
			if (document.body.classList.contains("__shaking")) return;
			injectStyle("__shake_style", SHAKE_STYLE);
			document.body.classList.add("__shaking");
			document.body.addEventListener(
				"animationend",
				() => {
					document.body.classList.remove("__shaking");
					removeEl("__shake_style");
				},
				{ once: true },
			);
		}

		function startSparkles(canvas: HTMLCanvasElement): void {
			canvas.width = window.innerWidth;
			canvas.height = window.innerHeight;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			const renderCtx = ctx;
			const SPARKLE_COLORS = ["#ff69b4", "#ff1493", "#ffb6c1", "#fff", "#ffe4f0", "#ffd700"];
			const EMOJIS = ["💖", "✨", "💅", "🌸", "💓", "⭐"];
			const particles = Array.from({ length: 60 }, () => ({
				x: Math.random() * canvas.width,
				y: Math.random() * canvas.height + canvas.height,
				size: Math.random() * 14 + 6,
				color: SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)],
				speed: Math.random() * 2 + 0.5,
				drift: (Math.random() - 0.5) * 1.2,
				angle: Math.random() * Math.PI * 2,
				spin: (Math.random() - 0.5) * 0.08,
				emoji: Math.random() < 0.35 ? EMOJIS[Math.floor(Math.random() * EMOJIS.length)] : null,
				opacity: Math.random() * 0.5 + 0.5,
			}));
			function drawSparkles() {
				renderCtx.clearRect(0, 0, canvas.width, canvas.height);
				for (const p of particles) {
					p.y -= p.speed;
					p.angle += p.spin;
					p.x += p.drift;
					if (p.y < -p.size * 2) {
						p.y = canvas.height + p.size;
						p.x = Math.random() * canvas.width;
					}
					renderCtx.save();
					renderCtx.globalAlpha = p.opacity;
					renderCtx.translate(p.x, p.y);
					renderCtx.rotate(p.angle);
					if (p.emoji) {
						renderCtx.font = `${p.size * 1.6}px serif`;
						renderCtx.textAlign = "center";
						renderCtx.textBaseline = "middle";
						renderCtx.fillText(p.emoji, 0, 0);
					} else {
						renderCtx.fillStyle = p.color;
						const s = p.size / 2;
						renderCtx.beginPath();
						for (let i = 0; i < 4; i++) {
							const a = (i / 4) * Math.PI * 2;
							const r = i % 2 === 0 ? s : s * 0.4;
							i === 0
								? renderCtx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
								: renderCtx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
						}
						renderCtx.closePath();
						renderCtx.fill();
					}
					renderCtx.restore();
				}
				sparkleFrame = requestAnimationFrame(drawSparkles);
			}
			drawSparkles();
		}

		function dismissBarbieBanner(): void {
			barbieBannerTimer = null;
			const banner = document.getElementById("__barbie_banner");
			if (!banner) return;
			banner.classList.add("__barbie_out");
			banner.addEventListener("animationend", () => banner.remove(), { once: true });
		}

		function closeBarbie(): void {
			if (!barbieActive) return;
			if (barbieBannerTimer !== null) {
				clearTimeout(barbieBannerTimer);
				barbieBannerTimer = null;
			}
			if (sparkleFrame !== null) {
				cancelAnimationFrame(sparkleFrame);
				sparkleFrame = null;
			}
			if (barbieAudio !== null) {
				barbieAudio.pause();
				barbieAudio.src = "";
				barbieAudio = null;
			}
			document.documentElement.classList.remove("__barbie");
			removeEl("__barbie_style");
			removeEl("__barbie_sparkles");
			const banner = document.getElementById("__barbie_banner");
			if (banner) {
				banner.classList.add("__barbie_out");
				banner.addEventListener("animationend", () => banner.remove(), { once: true });
			}
			barbieActive = false;
		}

		function showBarbie(): void {
			if (barbieActive) {
				closeBarbie();
				return;
			}
			barbieActive = true;
			injectStyle("__barbie_style", BARBIE_STYLE);
			document.documentElement.classList.add("__barbie");

			const banner = document.createElement("div");
			banner.id = "__barbie_banner";

			const badge = document.createElement("div");
			badge.id = "__barbie_badge";
			const dot = document.createElement("div");
			dot.id = "__barbie_dot";
			badge.appendChild(dot);
			badge.appendChild(document.createTextNode("💖 BARBIE"));

			const track = document.createElement("div");
			track.id = "__barbie_track";
			const text = document.createElement("div");
			text.id = "__barbie_text";
			text.textContent =
				"✨ BARBIE MODE ACTIVATED ✨ Life in plastic, it's fantastic! 💅 Ken is just Ken 🌸 Come on Barbie, let's go party! 💖 You're a Barbie girl 🌸 ✨ BARBIE MODE ACTIVATED ✨";
			track.appendChild(text);

			banner.appendChild(badge);
			banner.appendChild(track);
			document.body.appendChild(banner);

			const canvas = document.createElement("canvas");
			canvas.id = "__barbie_sparkles";
			document.body.appendChild(canvas);
			startSparkles(canvas);

			const audio = new Audio(`${import.meta.env.BASE_URL}easter-eggs/barbie-song.mp3`);
			audio.loop = true;
			audio.volume = 0.4;
			barbieAudio = audio;
			audio.play().catch(() => {});

			barbieBannerTimer = setTimeout(dismissBarbieBanner, 15_000);
			banner.addEventListener(
				"click",
				() => {
					if (barbieBannerTimer !== null) {
						clearTimeout(barbieBannerTimer);
						barbieBannerTimer = null;
					}
					closeBarbie();
				},
				{ once: true },
			);
		}

		function showSid(): void {
			if (document.getElementById("__sid_el")) return;
			injectStyle("__sid_style", SID_STYLE);
			const img = document.createElement("img");
			img.id = "__sid_el";
			img.src = `${import.meta.env.BASE_URL}easter-eggs/sid.webp`;
			img.alt = "";
			img.addEventListener(
				"animationend",
				() => {
					img.remove();
					removeEl("__sid_style");
				},
				{ once: true },
			);
			document.body.appendChild(img);
		}

		function startConfetti(canvas: HTMLCanvasElement): void {
			canvas.width = window.innerWidth;
			canvas.height = window.innerHeight;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			const renderCtx = ctx;
			const colors = DVD_COLORS;
			const particles = Array.from({ length: 180 }, () => ({
				x: Math.random() * canvas.width,
				y: Math.random() * canvas.height - canvas.height,
				w: Math.random() * 10 + 5,
				h: Math.random() * 5 + 3,
				color: colors[Math.floor(Math.random() * colors.length)],
				speed: Math.random() * 3 + 2,
				angle: Math.random() * Math.PI * 2,
				spin: (Math.random() - 0.5) * 0.15,
				drift: (Math.random() - 0.5) * 1.5,
			}));
			function drawConfetti() {
				renderCtx.clearRect(0, 0, canvas.width, canvas.height);
				for (const p of particles) {
					p.y += p.speed;
					p.angle += p.spin;
					p.x += p.drift;
					if (p.y > canvas.height) {
						p.y = -p.h;
						p.x = Math.random() * canvas.width;
					}
					renderCtx.save();
					renderCtx.translate(p.x + p.w / 2, p.y + p.h / 2);
					renderCtx.rotate(p.angle);
					renderCtx.fillStyle = p.color;
					renderCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
					renderCtx.restore();
				}
				confettiFrame = requestAnimationFrame(drawConfetti);
			}
			drawConfetti();
		}

		function closeDvd(): void {
			if (!dvdActive) return;
			if (dvdFrame !== null) {
				cancelAnimationFrame(dvdFrame);
				dvdFrame = null;
			}
			if (confettiFrame !== null) {
				cancelAnimationFrame(confettiFrame);
				confettiFrame = null;
			}
			if (cornerTimeout !== null) {
				clearTimeout(cornerTimeout);
				cornerTimeout = null;
			}
			if (finaleTimeout !== null) {
				clearTimeout(finaleTimeout);
				finaleTimeout = null;
			}
			removeEl("__dvd_style");
			removeEl("__dvd_overlay");
			dvdActive = false;
		}

		function toggleDvd(): void {
			if (dvdActive) return;

			injectStyle("__dvd_style", DVD_STYLE);

			const overlay = document.createElement("div");
			overlay.id = "__dvd_overlay";

			const logo = document.createElement("div");
			logo.id = "__dvd_logo";
			logo.textContent = "DVD";

			const canvas = document.createElement("canvas");
			canvas.id = "__dvd_confetti";

			overlay.appendChild(logo);
			overlay.appendChild(canvas);
			document.body.appendChild(overlay);

			dvdActive = true;

			// measure logo after it's in the DOM
			requestAnimationFrame(() => {
				const rect = logo.getBoundingClientRect();
				const logoW = rect.width;
				const logoH = rect.height;

				let x = (window.innerWidth - logoW) / 2;
				let y = (window.innerHeight - logoH) / 2;
				let dx = 4.5;
				let dy = 4.0;
				let colorIdx = 0;
				let steeringToCorner = false;
				let cornerTargetX = 0;
				let cornerTargetY = 0;

				logo.style.color = DVD_COLORS[colorIdx];
				logo.style.left = `${x}px`;
				logo.style.top = `${y}px`;

				function fireFinale(): void {
					startConfetti(canvas);
					const finale = document.createElement("div");
					finale.id = "__dvd_finale";
					finale.textContent = "וזה בשבילך אור";
					overlay.appendChild(finale);
					finaleTimeout = setTimeout(() => closeDvd(), 5000);
				}

				function bounce() {
					const maxX = window.innerWidth - logoW;
					const maxY = window.innerHeight - logoH;

					if (steeringToCorner) {
						const distX = cornerTargetX - x;
						const distY = cornerTargetY - y;
						const dist = Math.sqrt(distX * distX + distY * distY);
						if (dist <= 6) {
							x = cornerTargetX;
							y = cornerTargetY;
							logo.style.left = `${x}px`;
							logo.style.top = `${y}px`;
							fireFinale();
							return;
						}
						const speed = 6;
						x += (distX / dist) * speed;
						y += (distY / dist) * speed;
						logo.style.left = `${x}px`;
						logo.style.top = `${y}px`;
						dvdFrame = requestAnimationFrame(bounce);
						return;
					}

					x += dx;
					y += dy;

					let bounced = false;

					if (x <= 0) {
						x = 0;
						dx = Math.abs(dx);
						bounced = true;
					} else if (x >= maxX) {
						x = maxX;
						dx = -Math.abs(dx);
						bounced = true;
					}

					if (y <= 0) {
						y = 0;
						dy = Math.abs(dy);
						bounced = true;
					} else if (y >= maxY) {
						y = maxY;
						dy = -Math.abs(dy);
						bounced = true;
					}

					if (bounced) {
						colorIdx = (colorIdx + 1) % DVD_COLORS.length;
						logo.style.color = DVD_COLORS[colorIdx];

						const inCorner =
							(x <= CORNER_THRESH || x >= maxX - CORNER_THRESH) &&
							(y <= CORNER_THRESH || y >= maxY - CORNER_THRESH);

						if (inCorner) {
							logo.style.left = `${x}px`;
							logo.style.top = `${y}px`;
							if (cornerTimeout !== null) {
								clearTimeout(cornerTimeout);
								cornerTimeout = null;
							}
							fireFinale();
							return;
						}
					}

					logo.style.left = `${x}px`;
					logo.style.top = `${y}px`;
					dvdFrame = requestAnimationFrame(bounce);
				}

				cornerTimeout = setTimeout(() => {
					const maxX = window.innerWidth - logoW;
					const maxY = window.innerHeight - logoH;
					cornerTargetX = dx > 0 ? maxX : 0;
					cornerTargetY = dy > 0 ? maxY : 0;
					steeringToCorner = true;
				}, 8000);

				dvdFrame = requestAnimationFrame(bounce);
			});
		}

		// ── Gummy Bear easter egg ────────────────────────────────────────────────

		function onGummyMouseMove(e: MouseEvent): void {
			if (!gummyDrag) return;
			const { bear, ox, oy, lastX, lastY } = gummyDrag;
			gummyDrag.flingVx = e.clientX - lastX;
			gummyDrag.flingVy = e.clientY - lastY;
			gummyDrag.lastX = e.clientX;
			gummyDrag.lastY = e.clientY;
			bear.x = e.clientX - ox;
			bear.y = e.clientY - oy;
			bear.el.style.transform = `translate(${bear.x}px, ${bear.y}px) rotate(${bear.rotation}deg)`;
		}

		function onGummyMouseUp(): void {
			if (!gummyDrag) return;
			const { bear, flingVx, flingVy } = gummyDrag;
			bear.dragging = false;
			bear.vx = Math.max(-12, Math.min(12, flingVx * 0.7));
			bear.vy = Math.max(-14, Math.min(12, flingVy * 0.7));
			bear.el.classList.remove("__dragging");
			gummyDrag = null;
		}

		function gummyTick(): void {
			const W = window.innerWidth;
			const H = window.innerHeight;

			for (const bear of gummyBears) {
				if (bear.dragging) continue;

				bear.vy += 0.28; // gravity
				bear.x += bear.vx;
				bear.y += bear.vy;
				bear.rotation += bear.rotationSpeed;

				// wall bounce
				if (bear.x < 0) {
					bear.x = 0;
					bear.vx = Math.abs(bear.vx) * 0.82;
				} else if (bear.x + bear.size > W) {
					bear.x = W - bear.size;
					bear.vx = -Math.abs(bear.vx) * 0.82;
				}
				if (bear.y < 0) {
					bear.y = 0;
					bear.vy = Math.abs(bear.vy) * 0.7;
				} else if (bear.y + bear.size > H) {
					bear.y = H - bear.size;
					bear.vy = -Math.abs(bear.vy) * 0.78;
					bear.vx *= 0.97; // floor friction
					// kill tiny bounces so bears settle
					if (Math.abs(bear.vy) < 1.5) bear.vy = 0;
				}
			}

			// circle collision (O(n²) — fine for 30 bears)
			for (let i = 0; i < gummyBears.length; i++) {
				const a = gummyBears[i];
				for (let j = i + 1; j < gummyBears.length; j++) {
					const b = gummyBears[j];
					const acx = a.x + a.size / 2;
					const acy = a.y + a.size / 2;
					const bcx = b.x + b.size / 2;
					const bcy = b.y + b.size / 2;
					const dx = bcx - acx;
					const dy = bcy - acy;
					const dist = Math.hypot(dx, dy);
					const minDist = (a.size + b.size) / 2;
					if (dist < minDist && dist > 0.01) {
						const nx = dx / dist;
						const ny = dy / dist;
						const overlap = (minDist - dist) / 2;
						// push apart
						if (!a.dragging) {
							a.x -= nx * overlap;
							a.y -= ny * overlap;
						}
						if (!b.dragging) {
							b.x += nx * overlap;
							b.y += ny * overlap;
						}
						// elastic velocity exchange along normal
						const dvx = a.vx - b.vx;
						const dvy = a.vy - b.vy;
						const dot = dvx * nx + dvy * ny;
						if (dot > 0) {
							const impulse = dot * 0.9;
							if (!a.dragging) {
								a.vx -= impulse * nx;
								a.vy -= impulse * ny;
							}
							if (!b.dragging) {
								b.vx += impulse * nx;
								b.vy += impulse * ny;
							}
						}
					}
				}
			}

			for (const bear of gummyBears) {
				bear.el.style.transform = `translate(${bear.x}px, ${bear.y}px) rotate(${bear.rotation}deg)`;
			}

			gummyFrame = requestAnimationFrame(gummyTick);
		}

		function closeGummy(): void {
			if (!gummyActive) return;
			gummyActive = false;
			if (gummyFrame !== null) {
				cancelAnimationFrame(gummyFrame);
				gummyFrame = null;
			}
			if (gummyAudio !== null) {
				gummyAudio.pause();
				gummyAudio.src = "";
				gummyAudio = null;
			}
			for (const bear of gummyBears) {
				bear.el.remove();
			}
			gummyBears = [];
			gummyDrag = null;
			document.removeEventListener("mousemove", onGummyMouseMove);
			document.removeEventListener("mouseup", onGummyMouseUp);
			removeEl("__gummy-q");
			removeEl("__gummy-style");
		}

		function launchGummyBears(): void {
			removeEl("__gummy-q");

			const audio = new Audio(`${import.meta.env.BASE_URL}easter-eggs/gummy-bear-song.mp3`);
			audio.loop = true;
			audio.volume = 0.5;
			gummyAudio = audio;
			audio.play().catch(() => {});

			const W = window.innerWidth;
			const H = window.innerHeight;

			for (let i = 0; i < GUMMY_COUNT; i++) {
				const size = Math.floor(Math.random() * 80 + 60); // 60–140px
				const x = Math.random() * (W - size);
				const y = Math.random() * (H * 0.6); // spawn in upper 60% so bears fall down
				const vx = (Math.random() - 0.5) * 12;
				const vy = Math.random() * 8 - 10; // mostly upward initially
				const rotation = Math.random() * 360;
				const rotationSpeed = (Math.random() - 0.5) * 6;

				const img = document.createElement("img");
				img.src = `${import.meta.env.BASE_URL}easter-eggs/gummy-bear.webp`;
				img.alt = "";
				img.draggable = false;
				img.className = "__gummy-bear";
				img.style.width = `${size}px`;
				img.style.height = `${size}px`;
				img.style.transform = `translate(${x}px, ${y}px) rotate(${rotation}deg)`;

				const bear: GummyBear = {
					el: img,
					x,
					y,
					vx,
					vy,
					rotation,
					rotationSpeed,
					size,
					dragging: false,
				};

				img.addEventListener("mousedown", (e: MouseEvent) => {
					e.preventDefault();
					bear.dragging = true;
					bear.vx = 0;
					bear.vy = 0;
					img.classList.add("__dragging");
					gummyDrag = {
						bear,
						ox: e.clientX - bear.x,
						oy: e.clientY - bear.y,
						lastX: e.clientX,
						lastY: e.clientY,
						flingVx: 0,
						flingVy: 0,
					};
				});

				document.body.appendChild(img);
				gummyBears.push(bear);
			}

			document.addEventListener("mousemove", onGummyMouseMove);
			document.addEventListener("mouseup", onGummyMouseUp);
			gummyActive = true;
			gummyFrame = requestAnimationFrame(gummyTick);
		}

		function showGummyQuestion(): void {
			gummyLongPressTimer = null;
			if (document.getElementById("__gummy-q") || gummyActive) return;

			injectStyle("__gummy-style", GUMMY_STYLE);

			const playBtn = document.querySelector('[data-easter-egg="play-btn"]') as HTMLElement | null;
			const rect = playBtn?.getBoundingClientRect();
			const top = rect ? rect.top - 48 : 48;
			const left = rect ? rect.left + rect.width / 2 - 18 : 120;

			const btn = document.createElement("button");
			btn.id = "__gummy-q";
			btn.textContent = "?";
			btn.style.top = `${top}px`;
			btn.style.left = `${left}px`;
			btn.addEventListener("click", launchGummyBears);
			document.body.appendChild(btn);
		}

		function onGummyPressDown(e: MouseEvent): void {
			if (!(e.target as HTMLElement).closest('[data-easter-egg="play-btn"]')) return;
			if (gummyLongPressTimer !== null) clearTimeout(gummyLongPressTimer);
			gummyLongPressTimer = setTimeout(showGummyQuestion, 10_000);
		}

		function onGummyPressUp(): void {
			if (gummyLongPressTimer !== null) {
				clearTimeout(gummyLongPressTimer);
				gummyLongPressTimer = null;
			}
		}

		// ────────────────────────────────────────────────────────────────────────

		function onDocClick(e: MouseEvent): void {
			const target = e.target as HTMLElement;
			if (!target.closest("[data-roni-cut]")) return;
			const now = Date.now();
			sidClickTimestamps.push(now);
			if (sidClickTimestamps.length > SID_CLICK_COUNT) sidClickTimestamps.shift();
			if (
				sidClickTimestamps.length === SID_CLICK_COUNT &&
				now - sidClickTimestamps[0] <= SID_CLICK_WINDOW_MS
			) {
				sidClickTimestamps.length = 0;
				showSid();
			}
		}

		function onKeydown(e: KeyboardEvent): void {
			if (e.key === "Escape" && dvdActive) {
				closeDvd();
				return;
			}
			if (e.key === "Escape" && barbieActive) {
				closeBarbie();
				return;
			}
			if (e.key === "Escape" && gummyActive) {
				closeGummy();
				return;
			}

			const el = document.activeElement as HTMLElement | null;
			if (
				el?.tagName === "INPUT" ||
				el?.tagName === "TEXTAREA" ||
				el?.tagName === "SELECT" ||
				el?.isContentEditable
			)
				return;

			teamBuffer.push(e.key.toLowerCase());
			if (teamBuffer.length > OR_SEQ.length) teamBuffer.shift();
			if (teamBuffer.join("") === OR_SEQ.join("")) {
				teamBuffer = [];
				toggleDvd();
			}

			shakeBuffer.push(e.key.toLowerCase());
			if (shakeBuffer.length > SHAKE_SEQ.length) shakeBuffer.shift();
			if (shakeBuffer.join("") === SHAKE_SEQ.join("")) {
				shakeBuffer = [];
				showShake();
			}

			klassiBuffer.push(e.key.toLowerCase());
			if (klassiBuffer.length > KLASSI_SEQ.length) klassiBuffer.shift();
			if (klassiBuffer.join("") === KLASSI_SEQ.join("")) {
				klassiBuffer = [];
				showKlassi();
			}

			barbieBuffer.push(e.key.toLowerCase());
			if (barbieBuffer.length > BARBIE_SEQ.length) barbieBuffer.shift();
			if (barbieBuffer.join("") === BARBIE_SEQ.join("")) {
				barbieBuffer = [];
				showBarbie();
			}
		}

		document.addEventListener("click", onDocClick);
		document.addEventListener("keydown", onKeydown);
		document.addEventListener("mousedown", onGummyPressDown);
		document.addEventListener("mouseup", onGummyPressUp);

		return () => {
			document.removeEventListener("click", onDocClick);
			document.removeEventListener("keydown", onKeydown);
			document.removeEventListener("mousedown", onGummyPressDown);
			document.removeEventListener("mouseup", onGummyPressUp);
			removeEl("__sid_el");
			removeEl("__sid_style");
			if (dvdFrame !== null) cancelAnimationFrame(dvdFrame);
			if (confettiFrame !== null) cancelAnimationFrame(confettiFrame);
			if (cornerTimeout !== null) clearTimeout(cornerTimeout);
			if (finaleTimeout !== null) clearTimeout(finaleTimeout);
			removeEl("__dvd_style");
			removeEl("__dvd_overlay");
			document.body.classList.remove("__shaking");
			removeEl("__shake_style");
			removeEl("__klassi_banner");
			removeEl("__klassi_style");
			if (barbieBannerTimer !== null) clearTimeout(barbieBannerTimer);
			if (sparkleFrame !== null) cancelAnimationFrame(sparkleFrame);
			if (barbieAudio !== null) {
				barbieAudio.pause();
				barbieAudio.src = "";
				barbieAudio = null;
			}
			document.documentElement.classList.remove("__barbie");
			removeEl("__barbie_style");
			removeEl("__barbie_banner");
			removeEl("__barbie_sparkles");
			closeGummy();
			if (gummyLongPressTimer !== null) clearTimeout(gummyLongPressTimer);
		};
	}, []);
}
