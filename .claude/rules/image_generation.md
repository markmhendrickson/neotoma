<!-- Source: foundation/agent_instructions/cursor_rules/image_generation.mdc -->

# Image Generation Rule

Ensures generated image assets have real alpha transparency and no visual artifacts.

## Rule

**MUST NOT request "transparent background" in image generation prompts.** Generators bake a checkerboard pattern into the pixels instead of producing actual alpha.

**MUST use a two-step workflow when transparency is needed:**

1. **Generate on solid white (#FFFFFF)** — request "solid pure white background" in the prompt
2. **Strip white background programmatically** — use Pillow (or ImageMagick) to convert white pixels to alpha

## Post-Processing Script

```python
from PIL import Image
import numpy as np

img = Image.open("input.png").convert("RGBA")
data = np.array(img, dtype=np.float32)
rgb = data[:, :, :3]
distance = np.sqrt(np.sum((rgb - 255.0) ** 2, axis=2))
alpha = np.where(distance < 30, 0, np.where(distance < 60,
    (distance - 30) / 30 * 255, 255))
data[:, :, 3] = alpha
Image.fromarray(data.astype(np.uint8), "RGBA").save("output.png")
```

## Forbidden

- Requesting "TRANSPARENT background" or "full alpha" in generation prompts
- Checkerboard transparency patterns baked into image pixels
- Assuming generated PNGs will have actual alpha channels
- Delivering RGB images where RGBA is expected

## When This Applies

- All image generation for repository assets (icons, illustrations, cards, banners)
- Any use of AI image generation tools (gpt-image-1, DALL-E, Midjourney, etc.)
- Hero images, OG images, ICP card illustrations, favicon assets
