/**
 * Temperature conversion utilities.
 * All recipes are stored with temperatures as-extracted (usually °C from our prompts).
 * At display time, we convert to the user's preferred unit.
 */

// Matches patterns like: 180°C  180 °C  180°  (when followed by C)
const C_PATTERN = /(\d+(?:\.\d+)?)\s*°\s*C\b/gi;
// Matches patterns like: 350°F  350 °F
const F_PATTERN = /(\d+(?:\.\d+)?)\s*°\s*F\b/gi;
// Matches written-out forms: "180 degrees Celsius", "180 degrees C"
const DEGREES_C_PATTERN = /(\d+(?:\.\d+)?)\s+degrees?\s+(?:Celsius|centigrade|C)\b/gi;
const DEGREES_F_PATTERN = /(\d+(?:\.\d+)?)\s+degrees?\s+(?:Fahrenheit|F)\b/gi;

function toF(celsius: number): number {
  return Math.round(celsius * 9 / 5 + 32);
}

function toC(fahrenheit: number): number {
  return Math.round((fahrenheit - 32) * 5 / 9);
}

/**
 * Convert all temperature mentions in `text` to the target unit.
 * Only converts temperatures that are in the OTHER unit — avoids double-conversion.
 */
export function convertTemperaturesInText(text: string, targetUnit: 'C' | 'F'): string {
  if (!text) return text;

  if (targetUnit === 'F') {
    // Convert all °C → °F
    let result = text
      .replace(C_PATTERN, (_, t) => `${toF(parseFloat(t))}°F`)
      .replace(DEGREES_C_PATTERN, (_, t) => `${toF(parseFloat(t))}°F`);
    return result;
  } else {
    // Convert all °F → °C
    let result = text
      .replace(F_PATTERN, (_, t) => `${toC(parseFloat(t))}°C`)
      .replace(DEGREES_F_PATTERN, (_, t) => `${toC(parseFloat(t))}°C`);
    return result;
  }
}
