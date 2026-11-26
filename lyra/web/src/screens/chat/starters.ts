/** The empty chat's greeting and starter prompts. */

/** First things to say. The inbox one only once mail is connected. */
export const starters = (mail: boolean) => [mail ? "What's new in my inbox?" : "What can you do for me?", "What do you know about me so far?", "Remember that I prefer short replies"];
export const CHANNEL_STARTERS = ["What's still open here?", "Sum up where this stands", "What have we decided so far?"];

export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
