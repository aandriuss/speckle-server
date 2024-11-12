import type { ColumnDef } from './columns/types'
import type { TableRowData } from '~/components/viewer/schedules/types'
import { debug, DebugCategories } from '~/components/viewer/schedules/utils/debug'

export function safeJSONClone<T>(obj: T): T {
  const jsonString = JSON.stringify(obj)
  const parsed = JSON.parse(jsonString) as T
  return parsed
}

export function validateData(
  data: unknown[],
  handleError: (error: Error) => void
): boolean {
  try {
    if (!Array.isArray(data)) {
      throw new Error('Data must be an array')
    }

    const invalidItems = data.filter((item) => !isTableRowData(item))
    if (invalidItems.length > 0) {
      debug.warn(DebugCategories.VALIDATION, 'Invalid data items found', invalidItems)
      throw new Error(`Invalid data items found: ${invalidItems.length} items`)
    }

    debug.log(DebugCategories.VALIDATION, 'Data validation passed', {
      count: data.length
    })
    return true
  } catch (error) {
    handleError(error as Error)
    return false
  }
}

export function sortColumnsByOrder(columns: ColumnDef[]): ColumnDef[] {
  return [...columns].sort((a, b) => {
    const orderA = typeof a.order === 'number' ? a.order : 0
    const orderB = typeof b.order === 'number' ? b.order : 0
    return orderA - orderB
  })
}

export function isTableRowData(item: unknown): item is TableRowData {
  if (!item || typeof item !== 'object') return false

  const record = item as Record<string, unknown>
  const requiredFields = ['id', 'mark', 'category']

  const hasRequiredFields = requiredFields.every((field) => {
    const value = record[field]
    return (
      value !== undefined &&
      value !== null &&
      (typeof value === 'string' || typeof value === 'number')
    )
  })

  if (!hasRequiredFields) {
    debug.warn(DebugCategories.VALIDATION, 'Missing required fields', {
      item,
      missingFields: requiredFields.filter((field) => {
        const value = record[field]
        return (
          value === undefined ||
          value === null ||
          (typeof value !== 'string' && typeof value !== 'number')
        )
      })
    })
    return false
  }

  return true
}

export function updateLocalColumns(
  sourceColumns: ColumnDef[],
  updateFn: (columns: ColumnDef[]) => void
): void {
  try {
    const columns = sourceColumns.map((col) => ({
      ...col,
      visible: col.visible !== false, // Show column unless explicitly hidden
      type: col.type || 'string', // Ensure type is always set
      order: typeof col.order === 'number' ? col.order : 0 // Ensure order is always set
    }))

    debug.log(DebugCategories.COLUMNS, 'Updating local columns', columns)
    debug.logColumnVisibility(columns)

    updateFn(sortColumnsByOrder(columns))
  } catch (error) {
    debug.error(DebugCategories.ERROR, 'Error updating local columns', error)
    throw error
  }
}

export function transformToTableRowData(data: unknown[]): TableRowData[] {
  debug.log(DebugCategories.DATA_TRANSFORM, 'Starting data transformation', {
    timestamp: new Date().toISOString(),
    inputCount: data?.length,
    isArray: Array.isArray(data),
    firstItem: data?.[0],
    allItems: data
  })

  if (!Array.isArray(data)) {
    debug.warn(DebugCategories.VALIDATION, 'Invalid data format', data)
    return []
  }

  const validItems = data.filter(
    (item): item is Record<string, unknown> => item !== null && typeof item === 'object'
  )

  debug.log(DebugCategories.DATA_TRANSFORM, 'Valid items filtered', {
    timestamp: new Date().toISOString(),
    validCount: validItems.length,
    firstValidItem: validItems[0],
    allValidItems: validItems
  })

  const transformedData = validItems.map((item) => {
    // Extract required fields and visibility flag
    const { id, mark, category, type, name, host, details, _visible, ...rest } = item

    debug.log(DebugCategories.DATA_TRANSFORM, 'Processing item', {
      timestamp: new Date().toISOString(),
      raw: item,
      extractedFields: {
        id,
        mark,
        category,
        type,
        name,
        host,
        _visible,
        hasDetails: Array.isArray(details),
        detailsCount: Array.isArray(details) ? details.length : 0
      },
      remainingFields: rest
    })

    // Validate and transform details if they exist
    const transformedDetails = Array.isArray(details)
      ? details
          .filter(
            (detail): detail is Record<string, unknown> =>
              detail !== null && typeof detail === 'object'
          )
          .map((detail) => ({
            id: String(detail.id || ''),
            mark: String(detail.mark || ''),
            category: String(detail.category || ''),
            type: String(detail.type || ''),
            name: String(detail.name || ''),
            host: String(detail.host || ''),
            _visible:
              typeof detail._visible === 'boolean' ? detail._visible : undefined,
            ...detail
          }))
      : undefined

    // Construct the transformed item
    const transformedItem: TableRowData = {
      id: String(id || ''),
      mark: String(mark || ''),
      category: String(category || ''),
      type: String(type || ''),
      name: String(name || ''),
      host: String(host || ''),
      _visible: typeof _visible === 'boolean' ? _visible : undefined,
      ...rest
    }

    if (transformedDetails) {
      transformedItem.details = transformedDetails
    }

    debug.log(DebugCategories.DATA_TRANSFORM, 'Item transformed', {
      timestamp: new Date().toISOString(),
      transformedItem,
      hasDetails: Array.isArray(transformedItem.details),
      detailsCount: Array.isArray(transformedItem.details)
        ? transformedItem.details.length
        : 0,
      isVisible: transformedItem._visible
    })

    return transformedItem
  })

  // Filter out invisible items
  const visibleData = transformedData.filter((item) => {
    const isVisible = typeof item._visible === 'boolean' ? item._visible : true
    return isVisible
  })

  debug.log(DebugCategories.DATA_TRANSFORM, 'Transformation complete', {
    timestamp: new Date().toISOString(),
    totalCount: transformedData.length,
    visibleCount: visibleData.length,
    firstTransformedItem: visibleData[0],
    allTransformedItems: visibleData
  })

  return visibleData
}
