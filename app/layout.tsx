import type { Metadata, Viewport } from "next";
import { Archivo_Black, IBM_Plex_Mono, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";

// Three voices, three domains: the title plate shouts, the paper is read,
// the instrument reports. See DESIGN.md §4.
const archivoBlack = Archivo_Black({
  variable: "--font-archivo-black",
  weight: "400",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  weight: ["400", "600"],
  style: ["normal", "italic"],
  // Greek is loaded so ν, ρ and ω in running prose are set in the text face,
  // not borrowed from a maths font with different metrics.
  subsets: ["latin", "greek"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "600"],
  subsets: ["latin"],
});

/**
 * Greek only, and only as a fallback. IBM Plex Mono ships no Greek subset, so
 * a control labelled "VORTICITY ε" had nowhere to get its ε and fell through
 * to a serif maths italic — a different voice entirely, sitting inside a mono
 * uppercase label. This is a monospace face carrying just those glyphs, so
 * the letter matches the words beside it. The file is tiny.
 */
const greekMono = JetBrains_Mono({
  variable: "--font-greek-mono",
  weight: ["400", "600"],
  subsets: ["greek"],
});

export const metadata: Metadata = {
  title: "FLUIDITY — a Navier–Stokes playground",
  description:
    "An interactive fluid dynamics simulation running on your GPU, with the mathematics explained. Drag to disturb the field.",
  openGraph: {
    title: "FLUIDITY — a Navier–Stokes playground",
    description:
      "Seven live experiments in fluid dynamics — vortex streets, lift and stall, buoyant plumes — solved on your GPU and explained equation by equation.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FLUIDITY — a Navier–Stokes playground",
    description:
      "Seven live experiments in fluid dynamics, solved on your GPU and explained equation by equation.",
  },
};

export const viewport: Viewport = {
  themeColor: "#d6d3ca",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sourceSerif.variable} ${archivoBlack.variable} ${plexMono.variable} ${greekMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
