/**
 * Single source of truth for floor numbering and labelling.
 *
 * Floor numbers (higher = higher up the house):
 *    2  Attic
 *    1  First floor
 *    0  Ground floor
 *   -1  Garden floor   (lower ground / basement-level)
 *   -2  House (global)  — non-physical task buckets like "Everyday", "General"
 */

export function floorLabel(floor: number): string {
  if (floor === 2) return 'Attic'
  if (floor === 1) return 'First floor'
  if (floor === 0) return 'Ground floor'
  if (floor === -1) return 'Garden floor'
  if (floor === -2) return 'House (global)'
  return `Floor ${floor}`
}

/** Short label used in dense UI like the bookings-calendar room row.
 *  Lowercase, no "floor" suffix when it would be redundant. */
export function floorLabelShort(floor: number): string {
  if (floor === 2) return 'attic'
  if (floor === 1) return '1st floor'
  if (floor === 0) return 'ground floor'
  if (floor === -1) return 'garden floor'
  if (floor === -2) return 'global'
  return `floor ${floor}`
}

/** Floors in display order (top of house at index 0). */
export const ALL_FLOORS = [2, 1, 0, -1, -2] as const

/** Floors that should appear in the housekeeping/bedrooms grouped views.
 *  Excludes globals because those aren't physical floors. */
export const PHYSICAL_FLOORS = [2, 1, 0, -1] as const
