import { ogImageGenerationDuration } from "./metrics";

export class PerformanceMonitor {
    private timers: Map<string, number> = new Map();
    private durations: Map<string, number> = new Map();
    private address: string;
    private cacheHit: boolean = false;
    private status: string = 'success';

    constructor(address: string, cacheHit: boolean = false) {
        this.address = address;
        this.cacheHit = cacheHit;
    }

    setStatus(status: string) {
        this.status = status;
    }
    start(label: string) {
        this.timers.set(label, Date.now());
    }

    end(label: string) {
        const startTime = this.timers.get(label);
        if (startTime) {
            const duration = Date.now() - startTime;
            this.durations.set(label, duration);
            this.timers.delete(label);

            // Record to Prometheus
            ogImageGenerationDuration
                .labels({
                    step: label,
                    address: this.address,
                    cache_hit: String(this.cacheHit),
                    status: this.status
                })
                .observe(duration / 1000);
        }
    }

    getDuration(label: string): number {
        return this.durations.get(label) || 0;
    }

    getSummary(): string {
        let summary = '\nPerformance Summary:\n';
        let total = 0;

        // Exclude total duration
        this.durations.forEach((duration, label) => {
            if (label !== 'total') {
                summary += `${label}: ${duration}ms\n`;
                total += duration;
            }
        });

        const actualTotal = this.durations.get('total') || total;
        summary += `Total Time: ${actualTotal}ms\n`;
        return summary;
    }
}
