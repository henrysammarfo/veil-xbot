/** Canva / editorial poster styles — NOT generic dark UI box. */
export type PosterDesignStyle =
  | "editorial-serif"
  | "brutalist-type"
  | "glass-gradient"
  | "film-poster"
  | "swiss-grid"
  | "krea-ad";

export const POSTER_STYLES: Record<PosterDesignStyle, string> = {
  "editorial-serif": "Magazine editorial — large Instrument-style serif headline, asymmetric layout, generous whitespace, single accent line",
  "brutalist-type": "Brutalist typography — oversized bold sans, tight crop, high contrast black/white, one word hero",
  "glass-gradient": "Glassmorphism card — subtle mesh gradient behind frosted panel, premium SaaS launch aesthetic",
  "film-poster": "Cinematic film poster — title bottom third, moody photography or abstract texture, rating-strip energy",
  "swiss-grid": "Swiss design grid — strict alignment, Helvetica energy, one photo crop, minimal color",
  "krea-ad": "Krea/UGC ad poster — office/lifestyle photo composition with bold hook text overlay, not crypto clipart",
};

export function stylePrompt(style: PosterDesignStyle): string {
  return POSTER_STYLES[style];
}
