import { Deck } from "../Deck";
import { SLIDES_EXPYES } from "../slides";

// /pitch/expyes — track for EXPERIENCED closers ("fast track"). Opens with the
// "already collected $500k / better room" framing, then the shared deck body.
export default function PitchExpYes() {
  return <Deck slides={SLIDES_EXPYES} />;
}
