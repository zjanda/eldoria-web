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
  blocked_by_radiance?: boolean;
  attack_attribute?: Attribute | null;
  damage_dice?: string | null;
  /** How a designed or improvised power plays: its check and effect blocks. */
  composition?: Composition | null;
  source?: "campaign" | "created" | "equipment" | "improvised";
  damage_type?: string;
  equipment_id?: string | null;
  /** The player set its numbers by hand; the power budget leaves it alone. */
  house_ruled?: boolean;
  /** One line on how it plays, written by the server whenever the sheet changes. */
  summary?: string;
}

export type Attribute = "might" | "agility" | "wits" | "spirit" | "presence";
export type Pronouns = "she" | "he" | "they";
export type EquipmentSlot = "weapon" | "armor" | "accessory";

/** Something a hero wields or wears. Mirrors Equipment in backend/app/models/state.py. */
export interface Equipment {
  id: string;
  slot: EquipmentSlot;
  name: string;
  description: string;
  how_used: string;
  qualities: string[];
  attack_attribute: Attribute | null;
  damage_dice: string | null;
  damage_type: string;
  armor_bonus: number;
  max_agility_bonus: number | null;
  advantage_on_skills: string[];
}

/** Everything on a hero's sheet the player may set. Mirrors HeroSheet in backend/app/models/forge.py. */
export interface HeroSheet {
  name: string;
  pronouns: Pronouns;
  role: string;
  class_name: string;
  concept: string;
  ancestry: string;
  biography: string;
  level: number;
  attributes: Record<Attribute, number>;
  proficient_skills: string[];
  max_hp: number;
  hp: number | null;
  armor_class: number;
  resource_name: string;
  resource_max: number;
  resource_current: number | null;
  equipment: Equipment[];
  abilities: Ability[];
  appearance: string;
  attire: string;
  features: string[];
  palette: string[];
  accent_color: string;
  sigil: string;
}

export interface CreationQuestion {
  question: string;
  suggestions: string[];
}

export interface HeroDraftResponse {
  sheet: HeroSheet;
  questions: CreationQuestion[];
  /** No AI was available: this is a plain starter sheet to edit by hand. */
  degraded: boolean;
}

// Character creation. Mirrors backend/app/models/creation.py.

export interface AncestryDefinition {
  id: string;
  name: string;
  summary: string;
  bonuses: Partial<Record<Attribute, number>>;
  appearance: string;
}

export interface CallingDefinition {
  id: string;
  name: string;
  summary: string;
  base_hp: number;
  base_armor_class: number;
  max_agility_bonus: number;
  resource_max: number;
  attacks: Ability[];
  skill_choices: string[];
  skill_picks: number;
  attire: string;
  recommended_attributes: Record<Attribute, number>;
}

export interface OriginDefinition {
  id: string;
  name: string;
  summary: string;
  skill: string;
  story_edge: string;
}

/** One hero as the player designed them; the server validates it and derives the sheet. */
export interface HeroBuild {
  role_id: string;
  name: string;
  pronouns: Pronouns;
  ancestry: string;
  calling: string;
  origin: string;
  attributes: Record<Attribute, number>;
  skills: string[];
  appearance: string;
  attire: string;
  features: string[];
  accent_color: string | null;
  sigil: string | null;
  backstory: string;
}

export interface HeroRole {
  id: string;
  name: string;
  tagline: string;
  story: string;
  default_name: string;
  resource_name: string;
  resource_summary: string;
  origin_question: string;
  gifts: Ability[];
  sigil: string;
  accent_color: string;
  callings: CallingDefinition[];
  origins: OriginDefinition[];
  default_build: HeroBuild;
}

export interface CreationOptions {
  campaign_id: string;
  campaign_title: string;
  premise: string;
  roles: HeroRole[];
  ancestries: AncestryDefinition[];
  attributes: Attribute[];
  point_buy: { budget: number; minimum: number; maximum: number; costs: Record<string, number>; hp_per_might_modifier: number };
  skills: { id: string; name: string; attribute: Attribute }[];
  accent_colors: string[];
  sigils: string[];
  name_max_length: number;
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
  pronouns: string;
  ancestry: string;
  role: string;
  concept: string;
  equipment: Equipment[];
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
  /** With dice off nothing was rolled: "chosen" = the player decided it, "steady" = a fixed average. */
  fated?: "" | "chosen" | "steady";
}

/** How the player says an action turns out when dice are off. */
export type Fate = "success" | "failure" | "critical_success" | "critical_failure";

/** The rules of one tale. Mirrors GameRules in backend/app/models/state.py. */
export interface GameRules {
  difficulty: number;
  dice: boolean;
  resource_costs: boolean;
  rest_limits: boolean;
  learn_by_doing: boolean;
  house_rules: string[];
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
  effects: EffectBlock[];
}

export interface EffectBlock {
  kind: "damage" | "heal" | "condition" | "empower" | "narrative";
  target: "enemy" | "all_enemies" | "self" | "ally" | "party";
  power: "minor" | "moderate" | "major";
  condition: string | null;
  /** The hero's own name for a condition ("Frozen Solid"). */
  label?: string | null;
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
  /** "sandbox" for an open tale; otherwise the premade story's id. */
  campaign_id: string;
  premise: string;
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
  rich_narration: boolean;
  pending_chapter: ChapterPreview | null;
  undo_action: string | null;
  undo_snapshot_id: number | null;
  /** Set when the last step was a turn that can be told again differently. */
  retry_snapshot_id: number | null;
  rules: GameRules;
  wishes: string[];
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
