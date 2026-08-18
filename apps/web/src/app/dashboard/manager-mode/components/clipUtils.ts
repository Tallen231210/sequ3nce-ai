export const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * A stable colour per speaker.
 *
 * Hashed from the name rather than assigned by order, so a speaker keeps the
 * same colour between the timeline and the transcript, and between visits.
 */
export function speakerHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}
