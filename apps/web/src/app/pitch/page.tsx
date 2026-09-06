import { Deck } from "./Deck";
import { SLIDES } from "./slides";

// /pitch — the full closer pitch deck (both tracks welcome). Reps present this
// on video calls; the two-track variants live at /pitch/expno and /pitch/expyes.
export default function PitchDeck() {
  return <Deck slides={SLIDES} />;
}
