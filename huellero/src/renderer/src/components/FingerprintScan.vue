<script setup>
defineProps({
  // idle | scanning | ok | dup | error
  state: { type: String, default: 'idle' },
  size: { type: [Number, String], default: 132 },
})
</script>

<template>
  <div
    class="fp-scan"
    :class="state"
    :style="{ width: size + 'px', height: size * 1.05 + 'px' }"
  >
    <svg class="fp-frame" viewBox="0 0 100 100" preserveAspectRatio="none">
      <path d="M6 22 V6 H22" />
      <path d="M78 6 H94 V22" />
      <path d="M94 78 V94 H78" />
      <path d="M22 94 H6 V78" />
    </svg>

    <svg class="fp-glyph" viewBox="0 -1.5 24 27">
      <path
        d="M17.81,4.47C17.73,4.47 17.65,4.45 17.58,4.41C15.66,3.42 14,3 12,3C10.03,3 8.15,3.47 6.44,4.41C6.2,4.54 5.9,4.45 5.76,4.21C5.63,3.97 5.72,3.66 5.96,3.53C7.82,2.5 9.86,2 12,2C14.14,2 16,2.47 18.04,3.5C18.29,3.65 18.38,3.95 18.25,4.19C18.16,4.37 18,4.47 17.81,4.47M3.5,9.72C3.4,9.72 3.3,9.69 3.21,9.63C3,9.47 2.93,9.16 3.09,8.93C4.08,7.53 5.34,6.43 6.84,5.66C10,4.04 14,4.03 17.15,5.65C18.65,6.42 19.91,7.5 20.9,8.9C21.06,9.12 21,9.44 20.78,9.6C20.55,9.76 20.24,9.71 20.08,9.5C19.18,8.22 18.04,7.23 16.69,6.54C13.82,5.07 10.15,5.07 7.29,6.55C5.93,7.25 4.79,8.25 3.89,9.5C3.81,9.65 3.66,9.72 3.5,9.72M9.75,21.79C9.62,21.79 9.5,21.74 9.4,21.64C8.53,20.77 8.06,20.21 7.39,19C6.7,17.77 6.34,16.27 6.34,14.66C6.34,11.69 8.88,9.27 12,9.27C15.12,9.27 17.66,11.69 17.66,14.66A0.5,0.5 0 0,1 17.16,15.16A0.5,0.5 0 0,1 16.66,14.66C16.66,12.24 14.57,10.27 12,10.27C9.43,10.27 7.34,12.24 7.34,14.66C7.34,16.1 7.66,17.43 8.27,18.5C8.91,19.66 9.35,20.15 10.12,20.93C10.31,21.13 10.31,21.44 10.12,21.64C10,21.74 9.88,21.79 9.75,21.79M16.92,19.94C15.73,19.94 14.68,19.64 13.82,19.05C12.33,18.04 11.44,16.4 11.44,14.66A0.5,0.5 0 0,1 11.94,14.16A0.5,0.5 0 0,1 12.44,14.66C12.44,16.07 13.16,17.4 14.38,18.22C15.09,18.7 15.92,18.93 16.92,18.93C17.16,18.93 17.56,18.9 17.96,18.83C18.23,18.78 18.5,18.96 18.54,19.24C18.59,19.5 18.41,19.77 18.13,19.82C17.56,19.93 17.06,19.94 16.92,19.94M14.91,22C14.87,22 14.82,22 14.78,22C13.19,21.54 12.15,20.95 11.06,19.88C9.66,18.5 8.89,16.64 8.89,14.66C8.89,13.04 10.27,11.72 11.97,11.72C13.67,11.72 15.05,13.04 15.05,14.66C15.05,15.73 16,16.6 17.13,16.6C18.28,16.6 19.21,15.73 19.21,14.66C19.21,10.89 15.96,7.83 11.96,7.83C9.12,7.83 6.5,9.41 5.35,11.86C4.96,12.67 4.76,13.62 4.76,14.66C4.76,15.44 4.83,16.67 5.43,18.27C5.53,18.53 5.4,18.82 5.14,18.91C4.88,19 4.59,18.87 4.5,18.62C4,17.31 3.77,16 3.77,14.66C3.77,13.46 4,12.37 4.45,11.42C5.78,8.63 8.73,6.82 11.96,6.82C16.5,6.82 20.21,10.33 20.21,14.65C20.21,16.27 18.83,17.59 17.13,17.59C15.43,17.59 14.05,16.27 14.05,14.65C14.05,13.58 13.12,12.71 11.97,12.71C10.82,12.71 9.89,13.58 9.89,14.65C9.89,16.36 10.55,17.96 11.76,19.16C12.71,20.1 13.62,20.62 15.03,21C15.3,21.08 15.45,21.36 15.38,21.62C15.33,21.85 15.12,22 14.91,22Z"
        transform="translate(12,12) scale(1,1.35) translate(-12,-12)"
      />
    </svg>

    <div class="fp-line" />
  </div>
</template>

<style scoped>
.fp-scan {
  position: relative;
  color: var(--muted);
  transition: color 0.18s ease-out;
}

.fp-scan.scanning,
.fp-scan.ok {
  color: var(--accent);
}

.fp-scan.dup {
  color: var(--warn);
}

.fp-scan.error {
  color: var(--danger);
}

.fp-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  fill: none;
  stroke: currentColor;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.55;
}

.fp-glyph {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 58%;
  height: 58%;
  fill: currentColor;
  stroke: none;
}

.fp-line {
  position: absolute;
  left: 14%;
  right: 14%;
  top: 12%;
  height: 3px;
  border-radius: 3px;
  background: linear-gradient(90deg, transparent, currentColor, transparent);
  box-shadow: 0 0 10px 1px currentColor;
  opacity: 0;
}

.fp-scan.scanning .fp-line {
  animation: fp-sweep 0.9s ease-in-out infinite;
}

@keyframes fp-sweep {
  0% {
    top: 10%;
    opacity: 0;
  }
  12% {
    opacity: 1;
  }
  88% {
    opacity: 1;
  }
  100% {
    top: 84%;
    opacity: 0;
  }
}

/* Confirmación rápida: un único destello, sin quedarse animando */
.fp-scan.ok,
.fp-scan.dup,
.fp-scan.error {
  animation: fp-flash 0.4s ease-out;
}

@keyframes fp-flash {
  0% {
    filter: drop-shadow(0 0 0 currentColor);
  }
  35% {
    filter: drop-shadow(0 0 9px currentColor);
  }
  100% {
    filter: drop-shadow(0 0 0 currentColor);
  }
}
</style>