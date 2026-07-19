module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./index.html", "./frontend/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        military: {
          900: '#121714', // Tactical Deep Background
          800: '#1c2420', // Control Panel Layer
          700: '#2e3b34', // Primary Olive Drab Camouflage
          600: '#44574c', // Muted Accent Green
          accent: '#d4af37', // Gold Trim Uniform State
          text: '#f1f5f3'    // High-Contrast Readout White
        }
      }
    },
  },
  plugins: [],
}
