import { ref, onMounted } from 'vue'
import type { TreeItemComponentModel } from '../types'
import { debug } from '../utils/debug'

export function useDataOrganization() {
  debug.startState('dataOrganization')
  const rootNodes = ref<TreeItemComponentModel[]>([])
  let isInitialized = false

  // Function to update root nodes
  const updateRootNodes = (nodes: TreeItemComponentModel[]) => {
    debug.startState('updateRootNodes')

    // Log raw data from model with prominent console.log
    // eslint-disable-next-line no-console
    console.log('🔍 IMPORTANT RAW DATA FROM DATA ORGANIZATION:', {
      timestamp: new Date().toISOString(),
      nodesCount: nodes?.length,
      nodes: nodes?.map((node) => ({
        raw: node.rawNode?.raw,
        rawKeys: node.rawNode?.raw ? Object.keys(node.rawNode.raw) : [],
        children: node.children?.map((child) => ({
          raw: child.rawNode?.raw,
          rawKeys: child.rawNode?.raw ? Object.keys(child.rawNode.raw) : [],
          hasChildren: child.children && child.children.length > 0
        }))
      }))
    })

    debug.log('Updating root nodes:', {
      nodesLength: nodes?.length,
      firstNode: nodes?.[0],
      isArray: Array.isArray(nodes),
      firstNodeRaw: nodes?.[0]?.rawNode?.raw,
      firstNodeChildren: nodes?.[0]?.children,
      allNodes: nodes
    })

    if (!nodes || !Array.isArray(nodes)) {
      debug.error('Invalid nodes provided to updateRootNodes:', nodes)
      debug.completeState('updateRootNodes')
      return
    }

    // Validate node structure
    const validNodes = nodes.filter((node) => {
      const isValid = node && node.rawNode && node.rawNode.raw
      if (!isValid) {
        debug.warn('Invalid node structure:', node)
      }
      return isValid
    })

    debug.log('Valid nodes:', {
      originalCount: nodes.length,
      validCount: validNodes.length,
      firstValidNode: validNodes[0],
      firstValidNodeRaw: validNodes[0]?.rawNode?.raw,
      firstValidNodeChildren: validNodes[0]?.children,
      allValidNodes: validNodes
    })

    // Ensure we have valid data before updating
    if (validNodes.length === 0) {
      debug.error('No valid nodes found in update')
      debug.completeState('updateRootNodes')
      return
    }

    // Update the ref with valid nodes
    rootNodes.value = validNodes

    // Mark as initialized after first successful update
    if (!isInitialized) {
      isInitialized = true
      debug.log('Data organization initialized')
      // Log initial data state with prominent console.log
      // eslint-disable-next-line no-console
      console.log('🔍 IMPORTANT INITIAL DATA STATE:', {
        timestamp: new Date().toISOString(),
        isInitialized,
        nodesCount: rootNodes.value.length,
        firstNode: rootNodes.value[0],
        nodeCategories: rootNodes.value.map(
          (node) =>
            node.rawNode.raw.Other?.Category ||
            node.rawNode.raw.speckle_type ||
            node.rawNode.raw.type ||
            'Uncategorized'
        ),
        allNodes: rootNodes.value.map((node) => ({
          raw: node.rawNode?.raw,
          rawKeys: node.rawNode?.raw ? Object.keys(node.rawNode.raw) : [],
          children: node.children?.map((child) => ({
            raw: child.rawNode?.raw,
            rawKeys: child.rawNode?.raw ? Object.keys(child.rawNode.raw) : [],
            hasChildren: child.children && child.children.length > 0
          }))
        }))
      })
    }

    debug.log('Root nodes updated:', {
      nodesLength: rootNodes.value.length,
      firstNode: rootNodes.value[0],
      nodeCategories: rootNodes.value.map(
        (node) =>
          node.rawNode.raw.Other?.Category ||
          node.rawNode.raw.speckle_type ||
          node.rawNode.raw.type ||
          'Uncategorized'
      ),
      firstNodeChildren: rootNodes.value[0]?.children,
      firstNodeRaw: rootNodes.value[0]?.rawNode?.raw,
      allNodes: rootNodes.value
    })

    debug.completeState('updateRootNodes')
  }

  onMounted(() => {
    debug.log('useDataOrganization mounted, current rootNodes:', {
      nodesLength: rootNodes.value.length,
      hasNodes: rootNodes.value.length > 0,
      firstNode: rootNodes.value[0],
      firstNodeRaw: rootNodes.value[0]?.rawNode?.raw,
      firstNodeChildren: rootNodes.value[0]?.children,
      isInitialized
    })
  })

  // Function to check if data is ready
  const isDataReady = () => {
    const ready = isInitialized && rootNodes.value.length > 0
    debug.log('Checking data readiness:', {
      isInitialized,
      hasNodes: rootNodes.value.length > 0,
      isReady: ready
    })
    return ready
  }

  debug.completeState('dataOrganization')
  return {
    rootNodes,
    updateRootNodes,
    isDataReady
  }
}
