import type { Page } from "playwright";

export interface PerformanceMetrics {
  domContentLoaded?: number;
  domInteractive?: number;
  fcp?: number;
  lcp?: number;
  loadEvent?: number;
  memory?: PerformanceMemory;
  navigation?: NavigationTiming;
  paint?: PaintEntry[];
}

export interface NavigationTiming {
  domComplete: number;
  domContentLoadedEventEnd: number;
  domContentLoadedEventStart: number;
  domInteractive: number;
  loadEventEnd: number;
  loadEventStart: number;
  responseEnd: number;
  responseStart: number;
  workerReady?: number;
}

export interface PaintEntry {
  name: string;
  startTime: number;
}

interface PerformanceMemory {
  jsHeapSizeLimit: number;
  totalJSHeapSize: number;
  usedJSHeapSize: number;
}

export async function collectPerformance(page: Page): Promise<PerformanceMetrics> {
  return page.evaluate(() => {
    const navEntries = performance.getEntriesByType(
      "navigation",
    ) as PerformanceNavigationTiming[];
    const nav = navEntries[0];

    const navigation: NavigationTiming | undefined = nav
      ? {
          domComplete: nav.domComplete,
          domContentLoadedEventEnd: nav.domContentLoadedEventEnd,
          domContentLoadedEventStart: nav.domContentLoadedEventStart,
          domInteractive: nav.domInteractive,
          loadEventEnd: nav.loadEventEnd,
          loadEventStart: nav.loadEventStart,
          responseEnd: nav.responseEnd,
          responseStart: nav.responseStart,
        }
      : undefined;

    const paintEntries = performance.getEntriesByType(
      "paint",
    ) as PerformancePaintTiming[];
    const paint: PaintEntry[] = paintEntries.map((p) => ({
      name: p.name,
      startTime: p.startTime,
    }));

    const fcp = paintEntries.find((p) => p.name === "first-contentful-paint");
    const domInteractive = nav?.domInteractive;
    const domContentLoaded = nav?.domContentLoadedEventEnd;
    const loadEvent = nav?.loadEventEnd;

    let lcp: number | undefined;
    try {
      const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
      const lastEntry = lcpEntries[lcpEntries.length - 1];
      if (lastEntry !== undefined) {
        lcp = lastEntry.startTime;
      }
    } catch {
      // LCP may not be available
    }

    const perf = performance as unknown as {
      memory?: PerformanceMemory;
    };
    const memory = perf.memory;

    return {
      domContentLoaded,
      domInteractive,
      fcp: fcp?.startTime,
      lcp,
      loadEvent,
      memory,
      navigation,
      paint,
    };
  });
}
