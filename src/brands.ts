/** Project voice for copy — works for Veil, Magmos, web2, any registered project. */
import { getProject, type ProjectId } from "./projects/registry.js";

export type BrandKey = ProjectId;

export interface ProjectVoice {
  brand: string;
  name: string;
  pillars: string[];
  avoid: string[];
  tags: string[];
  link: () => string;
  /** Optional waitlist / signup URL (web2 or web3) */
  waitlistUrl: () => string;
}

export function brandVoice(key: BrandKey): ProjectVoice {
  const p = getProject(key);
  return {
    brand: p.id,
    name: p.name,
    pillars: p.pillars,
    avoid: p.avoid,
    tags: p.handles,
    link: () => p.primaryUrl,
    waitlistUrl: () => p.secondaryUrl?.trim() || "",
  };
}

export function brandLink(key: BrandKey): string {
  return getProject(key).primaryUrl;
}

/** @deprecated use brandVoice */
export const VEIL_VOICE = brandVoice("veil");
export const MAGOS_VOICE = brandVoice("magmos");
