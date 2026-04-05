# Design System: The Digital Epicurean — Speisekammer

## 1. Overview & Creative North Star
**Creative North Star: "The Curated Atelier"**

This design system moves away from the sterile, utilitarian nature of traditional recipe apps and moves toward the tactile, sensory experience of a high-end kitchen. The "Curated Atelier" approach treats every screen like a bespoke editorial layout. We break the "template" look through **intentional asymmetry**—such as offsetting hero images or using generous, unbalanced white space—to guide the eye with purpose rather than a rigid grid.

The experience must feel **smart yet organic**. By layering sophisticated serif typography over a palette of herb-inspired greens and warm woods, we create a digital environment that feels as premium as a Michelin-starred tasting menu.

**Brand Name:** Speisekammer (German for "pantry" / "larder")

---

## 2. Colors & Surface Philosophy

### Color Palette

| Role | Token | Hex |
|------|-------|-----|
| Primary | `primary` | `#315f3b` |
| Primary Container | `primary_container` | `#497851` |
| Primary Fixed | `primary_fixed` | `#bcefc0` |
| On Primary | `on_primary` | `#ffffff` |
| Secondary | `secondary` | `#805533` |
| Secondary Container | `secondary_container` | `#fdc39a` |
| Tertiary | `tertiary` | `#455d00` |
| Tertiary Container | `tertiary_container` | `#5a7706` |
| Background | `background` | `#faf9f5` |
| Surface | `surface` | `#faf9f5` |
| Surface Container Low | `surface_container_low` | `#f4f4f0` |
| Surface Container | `surface_container` | `#efeeea` |
| Surface Container High | `surface_container_high` | `#e9e8e4` |
| Surface Container Highest | `surface_container_highest` | `#e3e2df` |
| Surface Bright (white) | `surface_container_lowest` | `#ffffff` |
| On Surface | `on_surface` | `#1b1c1a` |
| On Surface Variant | `on_surface_variant` | `#40493d` |
| Outline | `outline` | `#707a6c` |
| Outline Variant | `outline_variant` | `#bfcaba` |
| Error | `error` | `#ba1a1a` |
| Inverse Surface | `inverse_surface` | `#2f312e` |

### The "No-Line" Rule
Explicit 1px solid borders are **strictly prohibited** for sectioning. Define boundaries through **Tonal Transition** — use `surface_container_low` for sidebar, `surface` for main content. The lack of hard lines makes the interface feel expansive and airy.

### Surface Hierarchy
- **Base:** `surface` (#faf9f5) — Primary canvas
- **Depth Level 1:** `surface_container_low` (#f4f4f0) — Subtle grouping
- **Depth Level 2:** `surface_container_high` (#e9e8e4) — Active/elevated cards

### The "Glass & Gradient" Rule
For floating elements (FAB, floating nav), use Glassmorphism:
- `surface_variant` at 60% opacity with `24px` backdrop-blur
- Hero CTAs: linear gradient from `primary` (#315f3b) to `primary_container` (#497851)

---

## 3. Typography: The Editorial Mix

| Role | Font | Usage |
|------|------|-------|
| **The Voice** | Newsreader (serif) | `display`, `headline`, `title-lg` — recipe titles, page headers |
| **The Engine** | Manrope (sans-serif) | `body`, `label`, `title-sm` — instructions, meta-data |

**Import:** Google Fonts — `Newsreader:ital,opsz,wght@0,6..72,200..800;1,6..72,200..800` + `Manrope:wght@200..800`

**Hierarchy Rule:** Always lead with Serif `display-md` for page headers, followed by a `label-md` all-caps (letter-spacing 5%) in `primary` color for category meta (e.g., "POULTRY • 45 MINS").

### Type Scale
| Token | Font | Size | Weight |
|-------|------|------|--------|
| `display-lg` | Newsreader | 3rem | 400 |
| `display-md` | Newsreader | 2.25rem | 400 |
| `headline-lg` | Newsreader | 1.75rem | 400 |
| `headline-md` | Newsreader | 1.375rem | 400 |
| `title-lg` | Newsreader | 1.25rem | 500 |
| `title-md` | Manrope | 1rem | 600 |
| `title-sm` | Manrope | 0.875rem | 600 |
| `body-lg` | Manrope | 1rem | 400 |
| `body-md` | Manrope | 0.875rem | 400 |
| `label-lg` | Manrope | 0.875rem | 500 |
| `label-md` | Manrope | 0.75rem | 500 |
| `label-sm` | Manrope | 0.6875rem | 500 |

---

## 4. Elevation & Depth

- **Tonal Layering:** Place `surface_container_lowest` (#fff) card on `surface_container` (#efeeea) background — slight shift in lightness creates soft natural lift
- **Ambient Shadow:** `box-shadow: 0 12px 40px rgba(47, 49, 46, 0.06)` for floating modals/drawers
- **Ghost Border Fallback:** `1px solid rgba(191, 202, 186, 0.15)` for high-density data

---

## 5. Components

### Cards & Recipes
- Background: `surface_container_low`
- Image: 40% of card height, `border-radius: 0.75rem` (xl)
- Title: `title-md` (Manrope 600)
- Meta: `label-sm` (Manrope 500, `on_surface_variant`)
- No dividers

### Buttons
- **Primary:** `background: primary (#315f3b)`, `color: white`, `border-radius: 9999px` (pill), no shadow
- **Secondary:** `background: secondary_container (#fdc39a)`, `color: on_secondary_container (#794e2e)`, pill shape — reserved for "Cook Now" / "Add to Cart"
- **Ghost/Outlined:** Use outline_variant border at 15% opacity

### Input Fields
- No bottom line or box — use `surface_container_highest` background with `border-radius: 0.5rem`
- No border when unfocused; soft `primary` ring on focus (2px, 30% opacity)

### Instructional Steps
- `body-lg` for step text
- No bullet points — use `primary_fixed` (#bcefc0) circle with `on_primary_fixed` (#00210a) numbers

---

## 6. Spacing
- Base unit: 4px (0.25rem)
- Standard gap: 24px (1.5rem)
- Section padding: 32px (2rem)

---

## 7. Motion
- Transitions: `0.2s ease-out` for hover/active states
- Drawer/modal: `0.3s cubic-bezier(0.4, 0, 0.2, 1)` slide-in

---

## 8. Do's and Don'ts

### Do:
- Use whitespace as separator — if you think you need a divider, add 16px vertical space instead
- Use `tertiary` (fresh lime) for success states and "Healthy Choice" badges
- Use Newsreader for any text describing flavor, history, or Chef's Notes
- Use `on_surface` (#1b1c1a) for text — never pure #000000

### Don't:
- Don't use 1px solid borders for sectioning
- Don't use DEFAULT (0.25rem) corner radius for large containers — use `xl` (0.75rem) for cards, `full` for chips/buttons
- Don't center-align long instructional text blocks — keep left-aligned

---

## 9. Stitch Project Reference

- **Project ID:** `9621188507761193142`
- **Key Screens:**
  - Logo (Speisekammer): `0b1bf084d53b49bab816a3976e9fa91b`
  - Main Feed: `d0a5c2759bf44fac8319356eb7e51a01`
  - Login: `2a3ee2ffb49a48d7bd1fa9f2d1d2b992`
  - Recipe Detail: `3ea0e69670134ad2b1eabcdaeb17b49d`
  - AI Import: `314bfd3c929c42d5a6719a1fe10a8297`
  - Drawer View: `b227905971154df7bd5bf241f5796bef`
