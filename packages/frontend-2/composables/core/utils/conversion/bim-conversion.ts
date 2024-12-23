import type {
  TreeItemComponentModel,
  ElementData,
  BIMNode
} from '~/composables/core/types'
import type { ParameterValue } from '~/composables/core/types/parameters'
import { debug, DebugCategories } from '../debug'
import { isValidBIMNodeData } from '~/composables/core/types/viewer/viewer-base'

/**
 * Convert any value to a string representation
 */
export function convertToString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>
    if ('id' in obj && obj.id) return String(obj.id)
    if ('Mark' in obj && obj.Mark) return String(obj.Mark)
    if ('Tag' in obj && obj.Tag) return String(obj.Tag)
  }
  return ''
}

/**
 * Convert raw value to parameter value
 * Note: This is a simplified conversion. Full parameter processing happens in useElementsData
 */
function convertToParameterValue(value: unknown): ParameterValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) return JSON.stringify(value)
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * Type guard for BIMNode
 */
export function isValidBIMNode(node: unknown): node is BIMNode {
  if (!node || typeof node !== 'object') return false
  const bimNode = node as { data?: unknown }
  return bimNode.data !== undefined && isValidBIMNodeData(bimNode.data)
}

/**
 * Type guard for TreeItemComponentModel
 */
export function isValidTreeItem(item: unknown): item is TreeItemComponentModel {
  if (!item || typeof item !== 'object') return false
  const treeItem = item as { data?: unknown; children?: unknown[] }
  return (
    isValidBIMNodeData(treeItem.data) &&
    (treeItem.children === undefined ||
      (Array.isArray(treeItem.children) &&
        treeItem.children.every((child) => isValidTreeItem(child))))
  )
}

/**
 * Extract element data from BIM node
 * Note: Full parameter processing happens in useElementsData
 * This only provides initial conversion for type safety
 */
export function extractElementData(node: BIMNode): ElementData {
  if (!isValidBIMNodeData(node.data)) {
    throw new Error('Invalid BIM node data')
  }

  const data = node.data
  const metadata = data.metadata || {}

  // Convert raw parameters to ParameterValue type
  const parameters: Record<string, ParameterValue> = {}
  if (data.parameters && typeof data.parameters === 'object') {
    Object.entries(data.parameters).forEach(([key, value]) => {
      parameters[key] = convertToParameterValue(value)
    })
  }

  // Extract essential fields
  return {
    id: String(data.id),
    type: String(data.type),
    mark: convertToString(metadata.Mark),
    category: convertToString(metadata.Category),
    parameters,
    _visible: true,
    name: convertToString(data.id),
    field: convertToString(data.id),
    header: convertToString(data.id),
    visible: true,
    removable: true
  }
}

/**
 * Convert tree item to element data
 */
export function convertTreeItemToElementData(
  treeItem: TreeItemComponentModel
): ElementData {
  if (!isValidTreeItem(treeItem)) {
    throw new Error('Invalid tree item data')
  }

  if (!treeItem.rawNode) {
    throw new Error('Missing raw node data')
  }

  debug.log(DebugCategories.DATA, 'Converting tree item to element data', {
    nodeId: treeItem.id,
    nodeType: treeItem.type,
    childCount: treeItem.children?.length || 0
  })

  const elementData = extractElementData(treeItem.rawNode)

  if (treeItem.children?.length) {
    elementData.details = treeItem.children.map(convertTreeItemToElementData)
  }

  return elementData
}

/**
 * Convert tree items to element data array
 */
export function convertTreeItemsToElementData(
  treeItems: TreeItemComponentModel[]
): ElementData[] {
  if (!Array.isArray(treeItems) || !treeItems.every(isValidTreeItem)) {
    throw new Error('Invalid tree items data')
  }

  debug.log(DebugCategories.DATA, 'Converting tree items to element data', {
    itemCount: treeItems.length
  })

  return treeItems.map(convertTreeItemToElementData)
}