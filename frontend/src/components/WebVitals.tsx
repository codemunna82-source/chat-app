'use client';

import { useReportWebVitals } from 'next/web-vitals';

export function WebVitals() {
  useReportWebVitals((metric) => {
    // Only log essential Core Web Vitals if they cross specific penalty thresholds
    // This allows us to debug where the 75% lighthouse score is occurring
    
    switch (metric.name) {
      case 'FCP': // First Contentful Paint
        console.log(`[Web Vitals] FCP: ${(metric.value / 1000).toFixed(2)}s`);
        break;
      case 'LCP': // Largest Contentful Paint (Heaviest Element)
        if (metric.value > 2500) {
            console.warn(`[Web Vitals] ⚠️ LCP Violation: ${(metric.value / 1000).toFixed(2)}s. Element:`, metric.entries[0]);
        } else {
            console.log(`[Web Vitals] LCP: ${(metric.value / 1000).toFixed(2)}s`);
        }
        break;
      case 'CLS': // Cumulative Layout Shift
        if (metric.value > 0.1) {
            console.warn(`[Web Vitals] ⚠️ CLS Violation: ${metric.value.toFixed(3)}. Shifted Elements:`, metric.entries);
        } else {
            console.log(`[Web Vitals] CLS: ${metric.value.toFixed(3)}`);
        }
        break;
      case 'FID': // First Input Delay
      case 'INP': // Interaction to Next Paint
        if (metric.value > 200) {
            console.warn(`[Web Vitals] ⚠️ ${metric.name} Violation: ${metric.value.toFixed(2)}ms`);
        } else {
            console.log(`[Web Vitals] ${metric.name}: ${metric.value.toFixed(2)}ms`);
        }
        break;
      case 'TTFB': // Time to First Byte
        console.log(`[Web Vitals] TTFB: ${metric.value.toFixed(2)}ms`);
        break;
    }
  });

  return null;
}
