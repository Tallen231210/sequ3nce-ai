import { Archivo, IBM_Plex_Mono } from "next/font/google";
import { BlueprintDeck } from "./BlueprintDeck";
import { TEAMS_SLIDES } from "./slides";

// /pitch/teams — the B2B pitch deck: Sales Ops & Management Placement.
// Presented on video calls to business owners. Blueprint × Dashboard system:
// Archivo for display, IBM Plex Mono for drawing labels. Noindex, unlisted.

const archivo = Archivo({ subsets: ["latin"], weight: ["500", "700", "800", "900"], variable: "--font-archivo", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });

export default function PitchTeams() {
  return (
    <div className={`${archivo.variable} ${plexMono.variable}`}>
      <BlueprintDeck slides={TEAMS_SLIDES} />
    </div>
  );
}
