/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        burnt: {
          50: "#FFF5EB",
          100: "#FFE8D1",
          200: "#FFD0A3",
          300: "#FFB876",
          400: "#FF9F48",
          500: "#CC5500",
          600: "#A34400",
          700: "#7A3300",
          800: "#522200",
          900: "#291100",
        },
      },
      fontFamily: {
        serif: ['"Noto Serif JP"', "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
