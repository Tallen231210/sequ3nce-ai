import { Deck } from "../Deck";
import { SLIDES_EXPNO } from "../slides";

// /pitch/expno — track for prospects with NO closing experience ("break in").
// Opens with the six-week / first-role framing, then the shared deck body.
export default function PitchExpNo() {
  return <Deck slides={SLIDES_EXPNO} />;
}
