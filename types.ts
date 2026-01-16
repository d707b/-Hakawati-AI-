
export enum AppStep {
  AUTH = 'AUTH', // Login Screen
  SETUP = 'SETUP', // Landing Page
  IDEA_GENERATOR = 'IDEA_GENERATOR', // Turn idea into story
  STORY_PREVIEW = 'STORY_PREVIEW', // Review/Edit story
  INPUT_STORY = 'INPUT_STORY', // Main Workspace
  GALLERY = 'GALLERY' // Saved Stories
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface Character {
  id: string;
  name: string;
  description: string;
  visualPrompt: string;
  avatarUrl?: string;
  isLoading?: boolean;
}

export interface StoryScene {
  id: string;
  text: string;
  imageUrl?: string;
  imagePrompt?: string; // Stored prompt for video generation tools
  isLoadingImage: boolean;
}

export interface StoryProject {
  id: string;
  userId: string; // Link project to user
  title: string;
  config: StoryConfig;
  characters: Character[];
  scenes: StoryScene[];
  updatedAt: number;
}

export interface StoryConfig {
  title: string;
  style: string;
  genre: string;
  aspectRatio: string;
  sceneCount: number;
  storyTextRaw: string;
}

export const ART_STYLES = [
  "Epic Cinematic Anime (Mappa Style)",
  "Ghibli Soft Touch",
  "Cyberpunk Anime 2077",
  "Dark Fantasy Illustration",
  "Vintage 90s Anime"
];

export const GENRES = [
  "مغامرة ملحمية (Epic Adventure)",
  "خيال مظلم (Dark Fantasy)",
  "خيال علمي (Sci-Fi)",
  "دراما إنسانية (Seinen Drama)",
  "أساطير شعبية (Folklore)"
];

export const WRITING_STYLES = [
  "سرد سينمائي (Cinematic Narrative)",
  "أسلوب الروايات المصورة (Manga Style)",
  "شاعري وعاطفي (Poetic)",
  "حوارات كثيفة (Dialogue Heavy)"
];

export const STORY_LENGTHS = [
  "قصيرة (Short - 3 scenes)",
  "متوسطة (Medium - 6 scenes)",
  "ملحمية (Epic - 10+ scenes)"
];

export const ASPECT_RATIOS = [
  { label: "أفقي سينمائي (16:9)", value: "16:9" },
  { label: "رأسي جوال (9:16)", value: "9:16" },
  { label: "مربع (1:1)", value: "1:1" }
];
