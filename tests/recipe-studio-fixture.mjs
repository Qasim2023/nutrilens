// Synthetic fixture shared by unit and isolated-browser tests; no provider calls.
export const recipe = {
  title: 'Lemon chickpea bowl', description: 'A bright, filling weeknight bowl.',
  prep_minutes: 10, cook_minutes: 15, servings: 2, difficulty: 'Easy',
  tags: ['Vegetarian', 'High fibre'],
  ingredients: [{ amount: '1 can (400 g)', name: 'rinsed chickpeas' }, { amount: '150 g', name: 'wholegrain rice' }, { amount: '1', name: 'lemon' }, { amount: '2 cups', name: 'spinach' }],
  steps: ['Cook the rice for 20 minutes.', 'Warm the chickpeas in a pan.', 'Fold in spinach until wilted.', 'Serve with lemon juice.'],
  nutrition_per_serving: { calories: 420, protein_g: 19, carbs_g: 60, fat_g: 11, fiber_g: 12 },
  chef_tip: 'Reserve a little lemon zest.', swaps: ['Use quinoa instead of rice.'],
};
