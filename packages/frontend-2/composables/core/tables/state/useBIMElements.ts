import { ref, computed } from 'vue'
import type {
  ViewerTree,
  TreeNode,
  ElementData,
  BimColumnDef,
  ColumnDef,
  BimValueType,
  ViewerNode,
  ViewerNodeRaw,
  WorldTreeRoot,
  PrimitiveValue
} from '~/composables/core/types'
import { debug, DebugCategories } from '~/composables/core/utils/debug'
import { useStore } from '~/composables/core/store'
import {
  createBimColumnDefWithDefaults,
  isBimColumnDef
} from '~/composables/core/types'
import { ViewerEvent } from '@speckle/viewer'
import { useViewerEventListener } from '~~/lib/viewer/composables/viewer'
import { isSpeckleReference } from '~/composables/core/types/viewer/viewer-types'
import type { ParameterValue } from '~/composables/core/types/parameters'
import { convertToParameterValue } from '~/composables/core/parameters/utils/parameter-conversion'

interface BIMElementsState {
  worldTree: ViewerTree | null
  treeNodes: TreeNode[]
  elements: ElementData[]
  columns: BimColumnDef[]
  isLoading: boolean
  error: Error | null
}

interface BIMElementsOptions {
  childCategories?: string[]
}

/**
 * Ensure value is a primitive value
 */
function ensurePrimitiveValue(value: unknown): PrimitiveValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) return JSON.stringify(value)
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * Infer parameter type from value with type safety
 */
function inferParameterType(value: unknown): BimValueType {
  if (value === null || value === undefined) return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  return 'string'
}

/**
 * Recursively process parameters from an object
 */
function processParameterObject(
  obj: Record<string, unknown>,
  prefix = '',
  result: Record<string, ParameterValue> = {}
): Record<string, ParameterValue> {
  Object.entries(obj).forEach(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key

    if (value !== null && value !== undefined) {
      if (typeof value === 'object' && !Array.isArray(value)) {
        // Recursively process nested objects
        processParameterObject(value as Record<string, unknown>, fullKey, result)
      } else {
        // Convert value and store with full key path
        result[fullKey] = convertToParameterValue(value)
      }
    }
  })

  return result
}

/**
 * Extract parameters from node data
 */
function extractParameters(nodeData: ViewerNodeRaw): Record<string, ParameterValue> {
  const parameters: Record<string, ParameterValue> = {}

  // Add standard parameters
  parameters.category =
    nodeData.Other?.Category ||
    nodeData.speckle_type ||
    nodeData.type ||
    'Uncategorized'
  parameters.mark = nodeData['Identity Data']?.Mark || ''
  parameters.name = nodeData.Name || ''
  parameters.type = nodeData.type || ''

  // Process parameters object if it exists
  if (nodeData.parameters && typeof nodeData.parameters === 'object') {
    Object.assign(parameters, processParameterObject(nodeData.parameters))
  }

  // Process Other object if it exists
  if (nodeData.Other && typeof nodeData.Other === 'object') {
    const otherParams = processParameterObject(nodeData.Other)
    // Skip Category as it's already handled
    delete otherParams.Category
    Object.assign(parameters, otherParams)
  }

  // Process top-level properties
  const topLevelParams = { ...nodeData }
  // Remove special properties we don't want to process
  const excludeKeys = [
    'id',
    'type',
    'Name',
    'Other',
    'Identity Data',
    'parameters',
    'metadata',
    'children'
  ]
  excludeKeys.forEach((key) => delete topLevelParams[key])
  Object.assign(parameters, processParameterObject(topLevelParams))

  return parameters
}

/**
 * Convert ViewerNode to ElementData format
 */
function convertViewerNodeToElementData(
  node: ViewerNode,
  childCategories: string[] = []
): ElementData {
  const nodeData = node.model?.raw
  if (!nodeData || isSpeckleReference(nodeData)) {
    debug.warn(DebugCategories.DATA_TRANSFORM, 'Invalid node data', {
      id: node.id,
      hasRaw: !!nodeData,
      isReference: isSpeckleReference(nodeData)
    })
    return {
      id: node.id,
      type: '',
      name: '',
      field: node.id,
      header: '',
      visible: true,
      removable: true,
      isChild: false,
      category: 'Uncategorized',
      parameters: {},
      metadata: {},
      details: []
    }
  }

  const category =
    nodeData.Other?.Category ||
    nodeData.speckle_type ||
    nodeData.type ||
    'Uncategorized'
  const isChild = childCategories.includes(category)

  debug.log(DebugCategories.DATA_TRANSFORM, 'Converting node', {
    id: nodeData.id,
    category,
    isChild,
    type: nodeData.type
  })

  // Extract all parameters
  const parameters = extractParameters(nodeData as ViewerNodeRaw)

  return {
    id: nodeData.id,
    type: nodeData.type || '',
    name: nodeData.Name || '',
    field: nodeData.id,
    header: nodeData.type || '',
    visible: true,
    removable: true,
    isChild,
    category,
    parameters,
    metadata: nodeData.metadata || {},
    details: []
  }
}

/**
 * Type guard for ViewerNodeRaw-like objects
 */
function isViewerNodeRawLike(value: unknown): value is ViewerNodeRaw {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof (value as { id: unknown }).id === 'string' &&
    !('referencedId' in value)
  )
}

/**
 * Recursively traverse node and its children/elements
 */
function traverseNode(node: ViewerNode, childCategories: string[] = []): ElementData[] {
  const elements: ElementData[] = []

  // Convert current node
  elements.push(convertViewerNodeToElementData(node, childCategories))

  // Get raw data
  const raw = node.model?.raw
  if (!raw || isSpeckleReference(raw)) return elements

  // Check for elements array
  if ('elements' in raw && Array.isArray(raw.elements)) {
    raw.elements.forEach((element: unknown) => {
      if (isViewerNodeRawLike(element)) {
        // Convert element to ViewerNode format
        const elementNode: ViewerNode = {
          id: element.id,
          model: {
            raw: element
          }
        }
        elements.push(...traverseNode(elementNode, childCategories))
      }
    })
  }

  // Check for children array
  if (node.children && Array.isArray(node.children)) {
    node.children.forEach((child) => {
      elements.push(...traverseNode(child, childCategories))
    })
  }

  return elements
}

interface ParameterStats {
  raw: number
  unique: Set<string>
  groups: Map<string, Set<string>>
  activeGroups: Map<string, Set<string>>
}

function initParameterStats(): ParameterStats {
  return {
    raw: 0,
    unique: new Set(),
    groups: new Map(),
    activeGroups: new Map()
  }
}

function updateParameterStats(
  stats: ParameterStats,
  key: string,
  _value: unknown // Prefix with _ to indicate unused
): void {
  stats.raw++
  stats.unique.add(key)

  // Handle parameter grouping
  const parts = key.split('.')
  if (parts.length > 1) {
    const group = parts[0]
    const param = parts[parts.length - 1]
    if (!stats.groups.has(group)) {
      stats.groups.set(group, new Set())
      stats.activeGroups.set(group, new Set())
    }
    stats.groups.get(group)!.add(param)
    // Mark as active if not a system parameter (like __closure)
    if (!key.startsWith('__')) {
      stats.activeGroups.get(group)!.add(param)
    }
  } else {
    if (!stats.groups.has('Parameters')) {
      stats.groups.set('Parameters', new Set())
      stats.activeGroups.set('Parameters', new Set())
    }
    stats.groups.get('Parameters')!.add(key)
    // Mark as active if not a system parameter
    if (!key.startsWith('__')) {
      stats.activeGroups.get('Parameters')!.add(key)
    }
  }
}

/**
 * Extract columns from BIM data with proper grouping
 */
function extractColumnsFromElements(elements: ElementData[]): BimColumnDef[] {
  const columnMap = new Map<string, BimColumnDef>()
  const stats = initParameterStats()

  // Add standard columns
  const standardColumns = [
    { field: 'id', name: 'ID', type: 'string' as BimValueType, group: 'Base' },
    { field: 'type', name: 'Type', type: 'string' as BimValueType, group: 'Base' },
    {
      field: 'mark',
      name: 'Mark',
      type: 'string' as BimValueType,
      group: 'Identity Data'
    },
    {
      field: 'category',
      name: 'Category',
      type: 'string' as BimValueType,
      group: 'Base'
    }
  ]

  standardColumns.forEach(({ field, name, type, group }) => {
    columnMap.set(
      field,
      createBimColumnDefWithDefaults({
        field,
        name,
        type,
        sourceValue: null,
        fetchedGroup: group,
        currentGroup: group
      })
    )
    updateParameterStats(stats, field, null)
  })

  // Process all elements to collect unique parameters with proper grouping
  const parameterTypes = new Map<
    string,
    {
      type: BimValueType
      category: string
      group: string
      name: string
      value: unknown
    }
  >()

  elements.forEach((element) => {
    const category =
      typeof element.category === 'string' ? element.category : 'Uncategorized'

    Object.entries(element.parameters).forEach(([key, value]) => {
      updateParameterStats(stats, key, value)

      if (!parameterTypes.has(key)) {
        // Handle parameter grouping
        const parts = key.split('.')
        const group = parts.length > 1 ? parts[0] : 'Parameters'
        const name = parts.length > 1 ? parts[parts.length - 1] : key

        parameterTypes.set(key, {
          type: inferParameterType(value),
          category,
          group,
          name,
          value
        })
      }
    })
  })

  // Create columns for all parameters
  parameterTypes.forEach((info, key) => {
    if (!columnMap.has(key)) {
      columnMap.set(
        key,
        createBimColumnDefWithDefaults({
          field: key,
          name: info.name,
          type: info.type,
          sourceValue: ensurePrimitiveValue(info.value),
          fetchedGroup: info.group,
          currentGroup: info.group,
          category: info.category
        })
      )
    }
  })

  // Log parameter stats with detailed group information
  debug.log(DebugCategories.DATA_TRANSFORM, 'Parameter stats', {
    raw: stats.raw,
    unique: stats.unique.size,
    groups: Object.fromEntries(
      Array.from(stats.groups.entries()).map(([group, params]) => [
        group,
        {
          total: params.size,
          active: stats.activeGroups.get(group)?.size || 0,
          parameters: Array.from(params),
          activeParameters: Array.from(stats.activeGroups.get(group) || new Set())
        }
      ])
    )
  })

  return Array.from(columnMap.values())
}

/**
 * Merge BIM columns with existing columns
 */
function mergeWithExistingColumns(
  bimColumns: BimColumnDef[],
  existingColumns: ColumnDef[]
): ColumnDef[] {
  const columnMap = new Map<string, ColumnDef>()

  // First add BIM columns
  bimColumns.forEach((col) => {
    columnMap.set(col.field, col)
  })

  // Then overlay existing columns to preserve settings
  existingColumns.forEach((col) => {
    const existing = columnMap.get(col.field)
    if (existing && isBimColumnDef(existing) && isBimColumnDef(col)) {
      // Preserve existing BIM column settings
      columnMap.set(col.field, {
        ...existing,
        visible: col.visible,
        order: col.order,
        width: col.width,
        currentGroup: col.currentGroup || existing.currentGroup
      })
    } else if (!existing) {
      // Keep non-BIM columns
      columnMap.set(col.field, col)
    }
  })

  return Array.from(columnMap.values())
}

/**
 * BIM elements composable
 * Handles BIM element initialization and state management
 */
export function useBIMElements(options: BIMElementsOptions = {}) {
  const store = useStore()

  // State
  const state = ref<BIMElementsState>({
    worldTree: null,
    treeNodes: [],
    elements: [],
    columns: [],
    isLoading: false,
    error: null
  })

  // Refhack for world tree reactivity
  const refhack = ref(1)
  useViewerEventListener(ViewerEvent.Busy, (isBusy: boolean) => {
    if (isBusy) return
    refhack.value++
  })

  // Computed properties
  const allElements = computed(() => {
    refhack.value // Trigger recompute
    return state.value.elements
  })
  const allColumns = computed(() => state.value.columns)
  const rawWorldTree = computed(() => state.value.worldTree)
  const rawTreeNodes = computed(() => state.value.treeNodes)
  const isLoading = computed(() => state.value.isLoading)
  const hasError = computed(() => !!state.value.error)

  /**
   * Initialize BIM elements directly from world tree
   */
  async function initializeElements(worldTree?: WorldTreeRoot): Promise<void> {
    try {
      debug.startState(DebugCategories.INITIALIZATION, 'Initializing BIM elements')
      state.value.isLoading = true
      state.value.error = null

      // Get nodes from world tree
      const tree = worldTree
      if (!tree?._root?.children?.length) {
        debug.warn(DebugCategories.DATA, 'No world tree data available')
        return
      }

      // Convert nodes to ElementData format recursively
      const convertedElements: ElementData[] = []
      tree._root.children.forEach((node) => {
        if (node) {
          convertedElements.push(...traverseNode(node, options.childCategories))
        }
      })

      debug.log(DebugCategories.DATA, 'Converted elements', {
        count: convertedElements.length,
        sample: convertedElements[0],
        childCount: convertedElements.filter((el) => el.isChild).length,
        parentCount: convertedElements.filter((el) => !el.isChild).length
      })

      // Extract columns from elements
      const bimColumns = extractColumnsFromElements(convertedElements)

      // Get existing columns from store
      const existingParentColumns = store.parentBaseColumns.value || []
      const existingChildColumns = store.childBaseColumns.value || []

      // Merge with existing columns
      const mergedParentColumns = mergeWithExistingColumns(
        bimColumns,
        existingParentColumns
      )
      const mergedChildColumns = mergeWithExistingColumns(
        bimColumns,
        existingChildColumns
      )

      // Update local state
      state.value.elements = convertedElements
      state.value.columns = bimColumns

      // Update store with data and merged columns
      await store.lifecycle.update({
        scheduleData: convertedElements,
        parentBaseColumns: mergedParentColumns,
        parentVisibleColumns: mergedParentColumns.filter(
          (col) => col.visible !== false
        ),
        childBaseColumns: mergedChildColumns,
        childVisibleColumns: mergedChildColumns.filter((col) => col.visible !== false)
      })

      debug.completeState(DebugCategories.INITIALIZATION, 'BIM elements initialized', {
        elementCount: convertedElements.length,
        columnCount: bimColumns.length,
        mergedParentCount: mergedParentColumns.length,
        mergedChildCount: mergedChildColumns.length,
        hasWorldTree: !!state.value.worldTree,
        nodeCount: state.value.treeNodes.length
      })
    } catch (err) {
      debug.error(DebugCategories.ERROR, 'Failed to initialize BIM elements:', err)
      state.value.error =
        err instanceof Error ? err : new Error('Failed to initialize BIM elements')
      throw state.value.error
    } finally {
      state.value.isLoading = false
    }
  }

  /**
   * Stop watching world tree changes
   */
  function stopWorldTreeWatch(): void {
    debug.log(DebugCategories.STATE, 'Stopped watching world tree changes')
  }

  return {
    allElements,
    allColumns,
    rawWorldTree,
    rawTreeNodes,
    isLoading,
    hasError,
    initializeElements,
    stopWorldTreeWatch
  }
}
