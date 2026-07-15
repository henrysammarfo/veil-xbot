/**
 * Smart capture event log — timeline brain for editor + VO sync.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export type CaptureEventType =
  | "navigate"
  | "ready"
  | "click"
  | "fill"
  | "scroll"
  | "scene"
  | "loading_start"
  | "loading_end"
  | "error"
  | "wait";

export interface CaptureEvent {
  tSec: number;
  type: CaptureEventType;
  note: string;
  url?: string;
  selector?: string;
  pageTitle?: string;
  errors?: string[];
}

export interface LoadingRange {
  startSec: number;
  endSec: number;
  note: string;
}

export interface CaptureEventLog {
  startedAt: number;
  demoUrl: string;
  events: CaptureEvent[];
  loadingRanges: LoadingRange[];
}

export class CaptureTimeline {
  private readonly t0: number;
  private events: CaptureEvent[] = [];
  private loadingOpen?: { startSec: number; note: string };

  constructor(
    readonly demoUrl: string,
    t0 = Date.now(),
  ) {
    this.t0 = t0;
  }

  nowSec(): number {
    return (Date.now() - this.t0) / 1000;
  }

  log(
    type: CaptureEventType,
    note: string,
    extra?: Partial<Pick<CaptureEvent, "url" | "selector" | "pageTitle" | "errors">>,
  ): CaptureEvent {
    const ev: CaptureEvent = { tSec: this.nowSec(), type, note, ...extra };
    this.events.push(ev);
    return ev;
  }

  loadingStart(note: string): void {
    if (this.loadingOpen) this.loadingEnd("superseded");
    this.loadingOpen = { startSec: this.nowSec(), note };
    this.log("loading_start", note);
  }

  loadingEnd(note = "loaded"): LoadingRange | null {
    if (!this.loadingOpen) return null;
    const range: LoadingRange = {
      startSec: this.loadingOpen.startSec,
      endSec: this.nowSec(),
      note: `${this.loadingOpen.note} → ${note}`,
    };
    this.loadingOpen = undefined;
    this.log("loading_end", note);
    return range;
  }

  toLog(): CaptureEventLog {
    const loadingRanges: LoadingRange[] = [];
    let open: { startSec: number; note: string } | undefined;
    for (const ev of this.events) {
      if (ev.type === "loading_start") {
        open = { startSec: ev.tSec, note: ev.note };
      } else if (ev.type === "loading_end" && open) {
        loadingRanges.push({ startSec: open.startSec, endSec: ev.tSec, note: open.note });
        open = undefined;
      }
    }
    return { startedAt: this.t0, demoUrl: this.demoUrl, events: [...this.events], loadingRanges };
  }

  save(capDir: string): string {
    const path = join(capDir, "capture-events.json");
    writeFileSync(path, JSON.stringify(this.toLog(), null, 2));
    return path;
  }
}

export function loadCaptureEvents(capDir: string): CaptureEventLog | null {
  const path = join(capDir, "capture-events.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as CaptureEventLog;
}
