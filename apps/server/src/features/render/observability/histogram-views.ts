import type { HistogramView } from "@ztube/observability";

// Names match metricsService.recordHistogram(...) call sites exactly; SDK
// applies the `biz.` prefix internally when matching the view selector, so
// callers stay free of namespace concerns.
export const renderHistogramViews: HistogramView[] = [
	{
		instrumentName: "render.job.duration_ms",
		boundaries: [100, 500, 1000, 5000, 15000, 30000, 60000, 120000, 300000, 600000, 1200000],
	},
	{
		instrumentName: "render.phase.sources.duration_ms",
		boundaries: [50, 100, 500, 1000, 5000, 15000, 30000, 60000, 120000, 300000],
	},
	{
		instrumentName: "render.phase.segments.duration_ms",
		boundaries: [10, 50, 100, 500, 1000, 5000, 15000, 60000],
	},
	{
		instrumentName: "render.phase.overlays_audio.duration_ms",
		boundaries: [10, 50, 100, 500, 1000, 5000, 15000, 60000],
	},
	{
		instrumentName: "render.phase.final.duration_ms",
		boundaries: [500, 1000, 5000, 15000, 30000, 60000, 120000, 300000, 600000, 1200000],
	},
	{
		instrumentName: "render.idempotency_probe.duration_ms",
		boundaries: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 5000],
	},
	// publish-confirm timeouts default to EVENT_PUBLISH_CONFIRM_TIMEOUT_MS=30000ms,
	// so buckets must cover the slow path that operators care about during broker degradation.
	{
		instrumentName: "render.publish.duration_ms",
		boundaries: [1, 5, 25, 100, 500, 1000, 5000, 15000, 30000],
	},
];
