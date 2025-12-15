export interface Point {
  x: number;
  y: number;
}

export interface Bubble {
  value: string; // "0", "1", "A", etc.
  x: number; // Percentage of image width (0-1)
  y: number; // Percentage of image height (0-1)
}

export interface BubbleGroup {
  id: string;
  label: string;
  type: 'identity' | 'question';
  bubbles: Bubble[];
  correctAnswer?: string[]; // For questions
  points?: number; // For questions
}

export interface OmrTemplate {
  imageUrl: string;
  bubbleRadius: number; // Pixel radius relative to original image width, scaled during render
  threshold?: number; // Fill percentage threshold (0.1 to 1.0) required to count as marked
  groups: BubbleGroup[];
}

export interface GradedBubble extends Bubble {
  fillPercentage: number;
  isMarked: boolean;
}

export interface GradedGroup extends Omit<BubbleGroup, 'bubbles'> {
  bubbles: GradedBubble[];
  markedValues: string[];
  isCorrect?: boolean;
  score?: number;
}

export interface GradingResult {
  totalScore: number;
  maxScore: number;
  groups: GradedGroup[];
  imageUrl: string;
  fileName?: string;
}