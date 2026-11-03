// Mirrors backend/app/models (state.py, api.py). Keep in sync when the schema changes.

export type RollMode = "normal" | "advantage" | "disadvantage";
export type RollOutcome = "success" | "failure" | "critical_success" | "critical_failure" | "none";

export interface StatusEffect {
  id: string;
  name: string;
  description: string;
  remaining_rounds: number | null;
}

export interface Ability {
  id: string;
  name: string;
  description: string;
  kind: "attack" | "heal" | "control" | "utility" | "transform" | "cleanse" | "revive" | "technique";
  usable_in: "exploration" | "combat" | "any";
  cost: number;
  blocked_by_radiance: boolean;
}

export interface InventoryItem {
  item_id: string;
  name: string;
  description: string;
  kind: "consumable" | "key" | "weapon" | "trinket";
  quantity: number;
}

export interface ArtSnapshot {
  image_key: string | null;
  direction: string;
  description: string;
  reference: string;
  version: number;
}

export interface VisualIdentity {
  physical_description: string;
  clothing_and_equipment: string;
  color_palette: string[];
  distinguishing_features: string[];
  current_visual_state: string;
  portrait_image_key: string | null;
  portrait_direction: string;
  portrait_version: number;
  portrait_reference: string;
  portrait_previous: ArtSnapshot | null;
  sigil: string;
  accent_color: string;
}

export interface Character {
  id: string;
  name: string;
  title: string;
  class_name: string;
  level: number;
  attributes: Record<string, number>;
  proficient_skills: string[];
  max_hp: number;
  hp: number;
  armor_class: number;
  resource_name: string;
  resource_max: number;
  resource_current: number;
  abilities: Ability[];
  statuses: StatusEffect[];
  inventory: InventoryItem[];
  visual: VisualIdentity;
  biography: string;
}

export interface NonPlayerCharacter {
  id: string;
  name: string;
  title: string;
  description: string;
  personality: string;
  is_companion: boolean;
  present: boolean;
  disposition: number;
  visual: VisualIdentity;
}

export interface ImageReference {
  cache_key: string;
  status: "fallback" | "pending" | "ready" | "failed";
  url: string | null;
}

export interface SceneState {
  scene_id: string;
  title: string;
  location_name: string;
  description: string;
  art_key: string;
  visual_state: string;
  lighting: "radiant" | "dim" | "dark";
  present_npc_ids: string[];
  ambient_sound: string;
  image: ImageReference | null;
  art_direction: string;
  art_version: number;
  art_reference: string;
  art_previous: ArtSnapshot | null;
}

export interface QuestObjective {
  id: string;
  description: string;
  completed: boolean;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  status: "active" | "completed" | "failed";
  objectives: QuestObjective[];
}

export interface JournalEntry {
  turn_number: number;
  title: string;
  text: string;
  category: "discovery" | "decision" | "event" | "lore";
}

export interface DiceRoll {
  id: string;
  turn_number: number;
  actor_name: string;
  purpose: string;
  expression: string;
  rolls: number[];
  kept: number[];
  modifier: number;
  total: number;
  mode: RollMode;
  target_number: number | null;
  target_label: string | null;
  outcome: RollOutcome;
}

export type EntryKind = "narration" | "dialogue" | "player" | "roll" | "combat" | "system";

export interface NarrativeEntry {
  id: string;
  turn_number: number;
  kind: EntryKind;
  text: string;
  speaker_id: string | null;
  speaker_name: string | null;
  roll_ids: string[];
}

export interface TurnRecap {
  turn_number: number;
  action_text: string;
  headline: string;
  happenings: string[];
  quotes: { speaker_name: string; text: string }[];
}

export interface CloudVoice {
  id: string;
  label: string;
  gender: "female" | "male" | "neutral";
  description: string;
  provider: string;
  recommended: boolean;
}

export interface VoiceCatalog {
  cloud_available: boolean;
  provider: string;
  voices: CloudVoice[];
}

export interface SuggestedAction {
  label: string;
  action_text: string;
}

export interface Composition {
  name: string;
  flavor: string;
  check: "attack" | "save" | "skill" | "none";
  attribute: string;
  skill: string | null;
  resource_spent: number;
  effects: { kind: string; target: string; power: string; condition: string | null }[];
}

export interface TechniqueOffer {
  id: string;
  hero_id: string;
  hero_name: string;
  composition: Composition;
  summary: string;
}

export interface EnemyView {
  id: string;
  name: string;
  description: string;
  hp: number;
  max_hp: number;
  armor_class: number;
  statuses: string[];
  cleansable: boolean;
  cleansed: boolean;
  cleanse_threshold_hp: number | null;
  accent_color: string;
  sigil: string;
}

export interface InitiativeEntry {
  combatant_id: string;
  name: string;
  side: "party" | "enemy";
  initiative: number;
}

export interface CombatView {
  encounter_id: string;
  round_number: number;
  initiative_order: InitiativeEntry[];
  enemies: EnemyView[];
}

export type GlossaryKind = "hero" | "ability" | "item" | "companion" | "npc" | "enemy" | "attack" | "status" | "rest";

export interface GlossaryEntry {
  term: string;
  aliases: string[];
  kind: GlossaryKind;
  title: string;
  subtitle: string;
  description: string;
  detail: string | null;
  accent: string | null;
}

export interface ChapterPreview {
  number: number;
  title: string;
  premise: string;
  places: string[];
  foes: string[];
  objectives: string[];
  degraded: boolean;
}

export interface Adventure {
  adventure_id: string;
  campaign_title: string;
  turn_number: number;
  scene: SceneState;
  party: Character[];
  npcs: NonPlayerCharacter[];
  quests: Quest[];
  journal: JournalEntry[];
  decisions: string[];
  combat: CombatView | null;
  dice_history: DiceRoll[];
  narrative_log: NarrativeEntry[];
  turn_recaps: TurnRecap[];
  suggested_actions: SuggestedAction[];
  technique_offers: TechniqueOffer[];
  images_enabled: boolean;
  chapter_complete: boolean;
  flags: string[];
  glossary: GlossaryEntry[];
  chapter_number: number;
  chapter_title: string;
  story_control: number;
  pending_chapter: ChapterPreview | null;
  undo_action: string | null;
  undo_snapshot_id: number | null;
}

export interface TurnResponse {
  new_entries: NarrativeEntry[];
  recap: TurnRecap;
  rolls: DiceRoll[];
  adventure: Adventure;
  provider_used: string;
  degraded: boolean;
}

export interface SaveSummary {
  adventure_id: string;
  name: string;
  campaign_title: string;
  scene_title: string;
  location: string;
  turn_number: number;
  created_at: string;
  updated_at: string;
  chapter_complete: boolean;
  last_happened: string | null;
  party: { name: string; hp: number; max_hp: number; accent_color: string }[];
}

export interface LatestAdventure {
  adventure_id: string;
  turn_number: number;
  scene_title: string;
  updated_at: string;
}

export interface ProviderStatus {
  narrative_provider: string;
  image_provider: string;
  images_enabled: boolean;
}
