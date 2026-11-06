/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f1720",
        panel: "#151c26",
        panel2: "#1b2430",
        border: "#2a3441",
        accent: "#4da3ff",
      },
    },
  },
  plugins: [],
};
