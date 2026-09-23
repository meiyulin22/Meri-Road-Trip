export function visibleAssistantText(content: string, visibleCharacters: number): string {
  return Array.from(content).slice(0, visibleCharacters).join("");
}

export function nextRevealCharacterCount(
  content: string,
  visibleCharacters: number,
): number {
  return Math.min(Array.from(content).length, visibleCharacters + 3);
}
