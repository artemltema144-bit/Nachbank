/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        mono: {
          bg: "#0B0C10",
          card: "#1F2833",
          pink: "#FF007F",
          neon: "#39FF14",
          blue: "#00F0FF",
          gray: "#C5C6C7",
        }
      }
    },
  },
  plugins: [],
}
