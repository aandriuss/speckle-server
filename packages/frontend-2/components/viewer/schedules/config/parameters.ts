import type { BIMNodeRaw, BimParameter } from '~/composables/core/types'
import { convertToString } from '../utils/dataConversion'
import { createBimParameter } from '~/composables/core/types'

// Raw parameter path definition
export interface ParameterPath {
  name: string
  path: string[]
  fallback: keyof BIMNodeRaw
}

// Helper to safely get nested property
export function getNestedValue(obj: BIMNodeRaw, path: string[]): string | undefined {
  if (!obj || !path?.length) return undefined

  let current: unknown = obj
  for (const key of path) {
    if (!current || typeof current !== 'object' || !key) return undefined
    current = (current as Record<string, unknown>)[key]
  }

  if (current === undefined || current === null) return undefined
  return convertToString(current)
}

// Helper to get all parameters from a group
export function getGroupParameters(
  obj: BIMNodeRaw,
  group: string
): Record<string, string> {
  const result: Record<string, string> = {}
  const groupData = obj[group as keyof BIMNodeRaw]

  if (groupData && typeof groupData === 'object') {
    Object.entries(groupData as Record<string, unknown>).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        result[key] = convertToString(value)
      }
    })
  }

  return result
}

// Helper to get all parameters from all groups
export function getAllGroupParameters(
  obj: BIMNodeRaw
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {}

  // Extract groups from raw data
  Object.entries(obj).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const groupParams = getGroupParameters(obj, key)
      if (Object.keys(groupParams).length > 0) {
        result[key] = groupParams
      }
    }
  })

  // Handle ungrouped (top-level) parameters
  const ungrouped: Record<string, string> = {}
  Object.entries(obj).forEach(([key, value]) => {
    if (
      !Object.keys(result).includes(key) && // Not a group name
      typeof value !== 'object' && // Not an object (which would be a group)
      value !== undefined &&
      value !== null
    ) {
      ungrouped[key] = convertToString(value)
    }
  })
  if (Object.keys(ungrouped).length > 0) {
    result['Ungrouped'] = ungrouped
  }

  return result
}

// Helper to get parameter group
export function getParameterGroup(parameterName: string, raw: BIMNodeRaw): string {
  // Check raw data groups
  for (const [group, value] of Object.entries(raw)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (parameterName in value) {
        return group
      }
    }
  }

  // If parameter is at root level
  if (parameterName in raw) {
    return 'Ungrouped'
  }

  // Default to Parameters group for any other case
  return 'Parameters'
}

// Helper to create BIM parameter from raw data
export function createBimParameterFromRaw(
  name: string,
  value: unknown,
  group: string
): BimParameter {
  const stringValue = convertToString(value)
  return createBimParameter({
    id: name,
    name,
    field: name,
    header: name,
    type: inferTypeFromValue(value),
    visible: true,
    removable: true,
    value: stringValue,
    sourceValue: stringValue,
    fetchedGroup: group,
    currentGroup: group,
    description: `${group} > ${name}`,
    metadata: {
      rawValue: value
    }
  })
}

// Helper to infer type from raw value
function inferTypeFromValue(value: unknown): BimParameter['type'] {
  if (value === null || value === undefined) return 'string'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (value instanceof Date) return 'date'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  return 'string'
}
