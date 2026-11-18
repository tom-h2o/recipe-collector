/**
 * Speisekammer skeleton key mark.
 *
 * Lived inside AuthGate until the About page and the public share page needed
 * it too; it is the same drawing, moved rather than redrawn so the three
 * screens cannot drift apart.
 */
export function SpeisekammerLogo({ size = 48 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="text-sk-primary"
    >
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.5" fill="none"/>
      <circle cx="11" cy="11" r="3" fill="currentColor"/>
      <line x1="16.5" y1="14.5" x2="30" y2="28" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="23" y1="21.5" x2="26" y2="24.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="26" y1="24.5" x2="29" y2="21.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M7 4 Q11 1 15 5 Q11 8 7 4Z" fill="currentColor" opacity="0.45"/>
    </svg>
  );
}
