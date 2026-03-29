import { sanitizePrompt } from './safety';
import { getPromptVersion } from './versions';

interface StoryboardPromptInput {
  concept: string;
  duration: number;
  style: string;
  platform: string;
  brandName?: string;
  targetAudience?: string;
  keyMessage?: string;
}

// v2.0 — matches system-prompts.md storyboard_v1
export function buildStoryboardPrompt(input: StoryboardPromptInput): string {
  const { concept, duration, style, platform, brandName, targetAudience, keyMessage } = input;
  const safeConcept = sanitizePrompt(concept);

  let prompt = `You are a professional film director and storyboard artist with experience in commercial advertising.`;

  prompt += `\n\nVideo Brief:`;
  prompt += `\n- Concept: ${safeConcept}`;
  prompt += `\n- Duration: ${duration} seconds total`;
  prompt += `\n- Style: ${style}`;
  prompt += `\n- Platform: ${platform}`;
  if (targetAudience) prompt += `\n- Target Audience: ${targetAudience}`;
  if (brandName) prompt += `\n- Brand: ${brandName}`;
  if (keyMessage) prompt += `\n- Key Message: ${keyMessage}`;

  prompt += `\n\nCreate a professional storyboard with exactly 9 scenes.`;
  prompt += `\nThe total duration of all scenes must equal exactly ${duration} seconds.`;

  prompt += `\n\nEach scene must follow this exact JSON structure:`;
  prompt += `\n{`;
  prompt += `\n  "scene_number": 1,`;
  prompt += `\n  "title": "Short scene title",`;
  prompt += `\n  "visual_description": "Detailed description in English for image generation — describe composition, subjects, colors, lighting, action",`;
  prompt += `\n  "dialogue": "Spoken text or voice-over in Arabic",`;
  prompt += `\n  "on_screen_text": "Any text on screen (or null)",`;
  prompt += `\n  "camera_angle": "Wide Shot | Medium Shot | Close-Up | Extreme Close-Up | POV | Aerial",`;
  prompt += `\n  "camera_movement": "Static | Pan Left | Pan Right | Zoom In | Zoom Out | Dolly | Handheld",`;
  prompt += `\n  "duration_seconds": 5,`;
  prompt += `\n  "mood": "Energetic | Calm | Dramatic | Humorous | Inspirational",`;
  prompt += `\n  "music_note": "Suggested music style and tempo",`;
  prompt += `\n  "transition": "Cut | Fade | Dissolve | Wipe"`;
  prompt += `\n}`;

  prompt += `\n\nStyle Guidelines:`;
  prompt += `\n- Cinematic: Dramatic lighting, wide establishing shots, emotional close-ups`;
  prompt += `\n- UGC: Handheld, natural lighting, authentic feel, direct-to-camera`;
  prompt += `\n- Animation: Describe shapes/characters/motion rather than photography`;
  prompt += `\n- Documentary: Observational, real moments, interviews, b-roll heavy`;

  prompt += `\n\nIMPORTANT: Return ONLY a valid JSON array of 9 scenes. No additional text.`;

  return prompt;
}

export const STORYBOARD_PROMPT_VERSION = getPromptVersion('storyboard');

export function getMockStoryboard(): Record<string, unknown>[] {
  return [
    { scene_number: 1, visual_description: 'Wide establishing shot of modern city skyline at golden hour, camera slowly descends', dialogue: 'في عالم مليء بالخيارات...', camera_angle: 'Wide Shot', camera_movement: 'Slow Descend', duration_seconds: 3, mood: 'Dramatic', music_note: 'Cinematic build-up' },
    { scene_number: 2, visual_description: 'Close-up of hands typing on laptop, coffee cup nearby, warm lighting', dialogue: 'تحتاج أدوات تفهمك', camera_angle: 'Close Up', camera_movement: 'Static', duration_seconds: 3, mood: 'Calm', music_note: 'Soft piano' },
    { scene_number: 3, visual_description: 'Product reveal with dramatic lighting, rotating on pedestal', dialogue: 'نقدم لك الحل', camera_angle: 'Medium Shot', camera_movement: 'Orbit', duration_seconds: 4, mood: 'Energetic', music_note: 'Beat drop' },
    { scene_number: 4, visual_description: 'Split screen showing before/after transformation', dialogue: 'من الفكرة للتنفيذ في دقائق', camera_angle: 'Split Screen', camera_movement: 'Slide', duration_seconds: 3, mood: 'Exciting', music_note: 'Upbeat tempo' },
    { scene_number: 5, visual_description: 'User interface demo, finger tapping on phone screen', dialogue: 'واجهة بسيطة وذكية', camera_angle: 'Over Shoulder', camera_movement: 'Zoom In', duration_seconds: 3, mood: 'Professional', music_note: 'Tech sounds' },
    { scene_number: 6, visual_description: 'Montage of generated marketing materials, quick cuts', dialogue: 'صور، حملات، تحليلات', camera_angle: 'Various', camera_movement: 'Quick Cuts', duration_seconds: 4, mood: 'Dynamic', music_note: 'Fast rhythm' },
    { scene_number: 7, visual_description: 'Happy customer looking at results on screen, smiling', dialogue: 'نتائج تتكلم عن نفسها', camera_angle: 'Medium Close Up', camera_movement: 'Dolly In', duration_seconds: 3, mood: 'Warm', music_note: 'Emotional' },
    { scene_number: 8, visual_description: 'Team collaboration scene, modern office, diverse team', dialogue: 'لفريقك الكامل', camera_angle: 'Wide Shot', camera_movement: 'Pan', duration_seconds: 4, mood: 'Collaborative', music_note: 'Inspiring' },
    { scene_number: 9, visual_description: 'Logo animation with tagline, brand colors background', dialogue: 'PyraSuite — تسويقك بذكاء', camera_angle: 'Center Frame', camera_movement: 'Zoom Out', duration_seconds: 3, mood: 'Confident', music_note: 'Logo sting' },
  ];
}
