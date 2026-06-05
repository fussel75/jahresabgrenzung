/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Farbschema laut SPEC.md §9
        anthrazit: '#2b2f36',
        dunkelblau: '#1e2a44',
        stichjahr: '#16a34a', // Grün
        folgejahr: '#f97316', // Orange
        jahreswechsel: '#dc2626', // Rot
      },
    },
  },
  plugins: [],
};
