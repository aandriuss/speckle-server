import type { TableSettings } from '../../types'
import { safeString } from '../../utils/validation'

/**
 * Constants
 */
export const TABLE_SORT_DIRECTIONS = {
  ASC: 'asc',
  DESC: 'desc'
} as const

export const TABLE_VIEW_MODES = {
  FLAT: 'flat',
  TREE: 'tree'
} as const

/**
 * Create table configuration
 */
export function createTableConfig(
  id: string,
  name: string,
  displayName?: string,
  description?: string
): TableSettings {
  return {
    id: safeString(id, crypto.randomUUID()),
    name: safeString(name, 'Untitled Table'),
    displayName: safeString(displayName, name) || safeString(name, 'Untitled Table'),
    description,
    parentColumns: [],
    childColumns: [],
    categoryFilters: {
      selectedParentCategories: [],
      selectedChildCategories: []
    },
    selectedParameterIds: [],
    metadata: {},
    lastUpdateTimestamp: Date.now()
  }
}
