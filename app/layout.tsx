import type { Metadata, Viewport } from "next";
import { Archivo_Black, IBM_Plex_Mono, Source_Serif_4 } from "next/font/google";
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
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "600"],
  subsets: ["latin"],
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
    <html lang="en" className={`${sourceSerif.variable} ${archivoBlack.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
