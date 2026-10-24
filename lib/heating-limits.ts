/**
 * Heating command limits, shared by the UI, the server actions and
 * lib/heating.ts. The SQL checks in db/12_heating.sql and the bridge
 * (bridge/heatmiser/bridge.mjs) use the same numbers — change them
 * together.
 */

export const HOLD_MIN_TEMP = 5
export const HOLD_MAX_TEMP = 25
export const HOLD_MIN_MINUTES = 15
export const HOLD_MAX_MINUTES = 720

export const COMMAND_KINDS = ['hold', 'cancel_hold', 'away_on', 'away_off'] as const
export type CommandKind = (typeof COMMAND_KINDS)[number]

/** Zone names go into neoHub commands inside single quotes. */
export function isCommandSafeZoneName(name: string): boolean {
  return name.length > 0 && name.length <= 100 && !/['"\\]/.test(name)
}
