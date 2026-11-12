import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Character, HeroSheet } from "../../api/types";
import { clearDraft, readDraft, sheetDraftKey, writeDraft } from "../../lib/drafts";
import { SheetForm, sheetOf } from "../creation/SheetForm";

interface SheetEditorProps {
  hero: Character;
  /** The tale this hero is in: unsaved edits are kept per tale and hero. */
  adventureId: string;
  /** Resolves true when the server accepted the sheet. */
  onSave: (heroId: string, sheet: HeroSheet) => Promise<boolean>;
  onClose: () => void;
}

/** Rewrite a hero's sheet in the middle of play. Saved edits can be undone like any other step. */
export function SheetEditor({ hero, adventureId, onSave, onClose }: SheetEditorProps) {
  const draftKey = sheetDraftKey(adventureId, hero.id);
  // Edits are kept as they are made, so a reloaded page reopens this editor with them intact.
  const [restored, setRestored] = useState(() => readDraft<HeroSheet>(draftKey) !== null);
  const [sheet, setSheet] = useState<HeroSheet>(() => readDraft<HeroSheet>(draftKey) ?? sheetOf(hero));
  const [saving, setSaving] = useState(false);

  useEffect(() => writeDraft(draftKey, sheet), [draftKey, sheet]);

  const close = () => {
    clearDraft(draftKey);
    onClose();
  };
  const save = async () => {
    if (saving || !sheet.name.trim()) return;
    setSaving(true);
    const accepted = await onSave(hero.id, sheet);
    setSaving(false);
    if (accepted) close();
  };

  // Rendered at the page root: the hero card's blurred panel would otherwise trap a fixed overlay inside it.
  return createPortal(
    <motion.div className="fixed inset-0 z-[60] flex justify-center bg-ink/90 backdrop-blur-sm sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      role="dialog" aria-modal="true" aria-label={`Edit ${hero.name}'s sheet`}>
      <div className="flex h-full w-full max-w-4xl flex-col overflow-hidden border-gold/20 bg-night-950 sm:rounded-xl sm:border">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gold/15 px-4 py-3">
          <div className="min-w-0">
            <p className="label">Character sheet</p>
            <h2 className="truncate font-display text-xl tracking-wide text-parchment">{sheet.name || hero.name}</h2>
          </div>
          <p className="hidden text-[0.72rem] text-mist sm:block">Your edit is final. It can be undone from the story controls.</p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {restored && (
            <p className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-gold/30 bg-gold/5 px-3 py-2 text-[0.82rem] text-parchment/90" role="status">
              <span>These are your unsaved edits from before the page reloaded. They are not saved to the tale until you press Save sheet.</span>
              <button className="text-mist underline-offset-4 hover:text-ember hover:underline" onClick={() => { setSheet(sheetOf(hero)); setRestored(false); }}>
                Discard them
              </button>
            </p>
          )}
          <SheetForm key={restored ? "restored" : "current"} sheet={sheet} onChange={setSheet} inPlay />
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-gold/15 px-4 py-3">
          <button className="btn-ghost" onClick={close} disabled={saving}>Cancel</button>
          <button className="btn-gold !py-2" onClick={save} disabled={saving || !sheet.name.trim()}>{saving ? "Saving…" : "Save sheet"}</button>
        </footer>
      </div>
    </motion.div>,
    document.body,
  );
}
