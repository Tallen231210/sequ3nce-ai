import { Deck } from "../Deck";
import { TEAMS_SLIDES } from "./slides";

// /pitch/teams — the B2B pitch deck: Sales Ops & Management Placement.
// Presented on video calls to business owners; same renderer as the closer
// deck at /pitch. Noindex, unlisted.
export default function PitchTeams() {
  return <Deck slides={TEAMS_SLIDES} />;
}
