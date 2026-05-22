import 'server-only'

export type HouseSettingKey =
  | 'address'
  | 'wifi_ssid'
  | 'wifi_password'
  | 'check_in_time'
  | 'check_out_time'
  | 'fridge_notes'
  | 'arrival_notes'
  | 'bin_calendar_url'

export const HOUSE_SETTING_LABELS: Record<HouseSettingKey, string> = {
  address: 'House address',
  wifi_ssid: 'WiFi network name',
  wifi_password: 'WiFi password',
  check_in_time: 'Check-in from',
  check_out_time: 'Check-out by',
  fridge_notes: 'Fridge / kitchen notes',
  arrival_notes: 'Other arrival notes',
  bin_calendar_url: 'Bin collection iCal URL',
}

export const HOUSE_SETTING_KEYS: HouseSettingKey[] = [
  'address',
  'wifi_ssid',
  'wifi_password',
  'check_in_time',
  'check_out_time',
  'fridge_notes',
  'arrival_notes',
  'bin_calendar_url',
]

export type HouseSettingsMap = Record<HouseSettingKey, string>

/** Build a key→value map from rows returned by `house_settings`. */
export function asSettingsMap(rows: { key: string; value: string }[]): HouseSettingsMap {
  const map: Partial<HouseSettingsMap> = {}
  for (const r of rows) {
    if (HOUSE_SETTING_KEYS.includes(r.key as HouseSettingKey)) {
      map[r.key as HouseSettingKey] = r.value
    }
  }
  // Fill any missing keys with empty string so callers don't get
  // undefined gaps.
  for (const k of HOUSE_SETTING_KEYS) {
    if (!(k in map)) map[k] = ''
  }
  return map as HouseSettingsMap
}
