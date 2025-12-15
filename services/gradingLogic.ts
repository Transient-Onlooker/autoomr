import { OmrTemplate, GradingResult, GradedGroup, GradedBubble } from "../types";

export const processOmrSheet = async (
  template: OmrTemplate,
  filledImageUrl: string,
  threshold: number = 0.80, // 80% fill requirement
  fileName?: string
): Promise<GradingResult> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = filledImageUrl;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      // Set canvas size to match image natural size for accurate pixel reading
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);

      const gradedGroups: GradedGroup[] = template.groups.map((group) => {
        const gradedBubbles: GradedBubble[] = group.bubbles.map((bubble) => {
          // Calculate actual pixel coordinates
          const centerX = bubble.x * canvas.width;
          const centerY = bubble.y * canvas.height;
          // Scale radius based on image width ratio if needed, but here we assume radius is relative to width
          // Let's assume template.bubbleRadius is a percentage of width like 0.015 (1.5%)
          const pixelRadius = template.bubbleRadius * canvas.width;

          // Get image data for the bubble area
          // We grab a square bounding box around the circle
          const startX = Math.floor(centerX - pixelRadius);
          const startY = Math.floor(centerY - pixelRadius);
          const diameter = Math.ceil(pixelRadius * 2);

          const imageData = ctx.getImageData(startX, startY, diameter, diameter);
          const pixels = imageData.data;

          let darkPixels = 0;
          let totalPixelsInCircle = 0;

          for (let y = 0; y < diameter; y++) {
            for (let x = 0; x < diameter; x++) {
              // Distance from center
              const dx = x - pixelRadius;
              const dy = y - pixelRadius;
              if (dx * dx + dy * dy <= pixelRadius * pixelRadius) {
                totalPixelsInCircle++;
                
                const index = (y * diameter + x) * 4;
                const r = pixels[index];
                const g = pixels[index + 1];
                const b = pixels[index + 2];
                
                // Simple luminance formula
                const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
                
                // Threshold for "darkness" (pencil mark). 
                // < 128 is a safe bet for dark marks on white paper, but adjustable.
                if (luminance < 140) { 
                  darkPixels++;
                }
              }
            }
          }

          const fillPercentage = totalPixelsInCircle > 0 ? darkPixels / totalPixelsInCircle : 0;
          
          return {
            ...bubble,
            fillPercentage,
            isMarked: fillPercentage >= threshold
          };
        });

        const markedValues = gradedBubbles
          .filter(b => b.isMarked)
          .map(b => b.value)
          .sort((a, b) => {
            // Try to sort numerically if possible, otherwise alphabetically
            const numA = parseInt(a);
            const numB = parseInt(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
          });

        let isCorrect: boolean | undefined = undefined;
        let score = 0;

        if (group.type === 'question') {
          // If no correct answer is defined, do not grade it (leave isCorrect as undefined)
          if (group.correctAnswer && group.correctAnswer.length > 0 && !(group.correctAnswer.length === 1 && group.correctAnswer[0] === "")) {
              // Compare markedValues with correctAnswer
              // For multi-select, we usually require exact match
              const markedString = markedValues.join(',');
              const correctString = group.correctAnswer.slice().sort().join(','); // ensure sorted
              
              isCorrect = markedString === correctString;
              score = isCorrect ? (group.points || 0) : 0;
          }
        }

        return {
          ...group,
          bubbles: gradedBubbles,
          markedValues,
          isCorrect,
          score
        };
      });

      const totalScore = gradedGroups.reduce((sum, g) => sum + (g.score || 0), 0);
      
      // Calculate max score only for questions that were actually graded
      const maxScore = gradedGroups.reduce((sum, g) => {
          if (g.type === 'question' && g.isCorrect !== undefined) {
              return sum + (g.points || 0);
          }
          return sum;
      }, 0);

      resolve({
        totalScore,
        maxScore,
        groups: gradedGroups,
        imageUrl: filledImageUrl,
        fileName
      });
    };

    img.onerror = (err) => reject(err);
  });
};