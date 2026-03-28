interface StoryboardPromptInput {
  concept: string;
  duration: number;
  style: string;
  platform: string;
  brandName?: string;
}

// v1.0
export function buildStoryboardPrompt(input: StoryboardPromptInput): string {
  return `Act as a professional film director and storyboard artist.
Video concept: ${input.concept}
Duration: ${input.duration} seconds
Style: ${input.style}
Platform: ${input.platform}
${input.brandName ? `Brand: ${input.brandName}` : ''}

Create a professional storyboard with exactly 9 scenes. Return valid JSON array, each:
{ "scene_number": number, "visual_description": string (English, for image gen), "dialogue": string (Arabic), "camera_angle": string, "camera_movement": string, "duration_seconds": number, "mood": string, "music_note": string }

Total duration must equal ${input.duration} seconds. Return ONLY valid JSON array.`;
}

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
    { scene_number: 9, visual_description: 'Logo animation with tagline, brand colors background', dialogue: 'Pixora — تسويقك بذكاء', camera_angle: 'Center Frame', camera_movement: 'Zoom Out', duration_seconds: 3, mood: 'Confident', music_note: 'Logo sting' },
  ];
}
