/* Read-along helpers for the story log: find the word under a click, and highlight the word being read.
   The highlight uses the CSS Custom Highlight API, so the text's markup is never changed. */

const HIGHLIGHT = "narrator-word";

type CaretDocument = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

/**
 * The offset in `text` of the word clicked at (x, y) inside `container`, whose text content is `text`.
 * Null when the click was a text selection, or not on a word.
 */
export function wordStartAt(container: HTMLElement, text: string, x: number, y: number): number | null {
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed) return null; // the player is selecting text, not asking to listen
  const doc = document as CaretDocument;
  let node: Node | null = null;
  let offset = 0;
  if (doc.caretPositionFromPoint) {
    const position = doc.caretPositionFromPoint(x, y);
    if (position) ({ offsetNode: node, offset } = position);
  } else if (doc.caretRangeFromPoint) {
    const range = doc.caretRangeFromPoint(x, y);
    if (range) {
      node = range.startContainer;
      offset = range.startOffset;
    }
  }
  if (!node || !container.contains(node)) return null;
  const before = document.createRange();
  before.setStart(container, 0);
  before.setEnd(node, offset);
  return snapToWord(text, before.toString().length);
}

/** The start of the word at `index`; from a space, the next word. Null past the last word. */
export function snapToWord(text: string, index: number): number | null {
  let at = Math.max(0, Math.min(index, text.length));
  // A caret just after a word's last letter belongs to that word.
  if ((at === text.length || /\s/.test(text[at])) && at > 0 && /\S/.test(text[at - 1])) at -= 1;
  while (at < text.length && /\s/.test(text[at])) at += 1;
  if (at >= text.length) return null;
  while (at > 0 && /\S/.test(text[at - 1])) at -= 1;
  return at;
}

/** Highlight characters [start, end) of a log entry's text, or clear the highlight (null). */
export function highlightWord(root: HTMLElement | null, entryId: string, word: { start: number; end: number } | null) {
  if (typeof CSS === "undefined" || !("highlights" in CSS) || typeof Highlight === "undefined") return;
  const container = word && word.start >= 0 ? root?.querySelector<HTMLElement>(`[data-entry-text="${CSS.escape(entryId)}"]`) : null;
  const range = container && word ? rangeOf(container, word.start, word.end) : null;
  if (range) CSS.highlights.set(HIGHLIGHT, new Highlight(range));
  else CSS.highlights.delete(HIGHLIGHT);
}

function rangeOf(container: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let seen = 0;
  let started = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (!started && start < seen + length) {
      range.setStart(node, start - seen);
      started = true;
    }
    if (started && end <= seen + length) {
      range.setEnd(node, end - seen);
      return range;
    }
    seen += length;
  }
  return null;
}
