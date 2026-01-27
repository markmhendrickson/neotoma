# sample_meal.pdf

**Expected Type:** meal

**Expected Extraction:**

- date: "2024-12-18"
- name: "Daily Meal Log"
- calories: 1705
- macros: "protein: 107g, carbs: 145g, fat: 43g"
- meals: ["breakfast", "lunch", "dinner"]

**Entities:**

None expected (meal is self-contained)

**Events:**

- MealLogged: 2024-12-18T00:00:00Z (for each meal)

**Testing:**

Use for testing meal log parsing and extraction of:
- Meal times and names
- Calorie counts per meal
- Macronutrient breakdown
- Daily totals
- Food items
