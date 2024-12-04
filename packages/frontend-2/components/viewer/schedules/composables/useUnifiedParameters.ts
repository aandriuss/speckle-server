import { computed, type ComputedRef, watch } from 'vue'
import type {
  UnifiedParameter,
  ProcessedHeader,
  CustomParameter
} from '~/composables/core/types'
import { useStore } from '../core/store'
import { debug, DebugCategories } from '../debug/useDebug'

interface UseUnifiedParametersProps {
  discoveredParameters: ComputedRef<{
    parent: ProcessedHeader[]
    child: ProcessedHeader[]
  }>
  customParameters: ComputedRef<CustomParameter[] | null>
}

export function useUnifiedParameters({
  discoveredParameters,
  customParameters
}: UseUnifiedParametersProps) {
  const store = useStore()

  // Convert discovered parameters to unified format
  const convertDiscoveredToUnified = (header: ProcessedHeader): UnifiedParameter => ({
    id: header.field,
    name: header.header,
    field: header.field,
    header: header.header,
    type: header.type === 'number' ? 'equation' : 'fixed',
    category: header.category,
    description: header.description || '',
    source: header.source,
    isFetched: true,
    fetchedGroup: header.fetchedGroup,
    currentGroup: header.currentGroup,
    visible: true,
    removable: true
  })

  // Convert custom parameters to unified format
  const convertCustomToUnified = (param: CustomParameter): UnifiedParameter => ({
    id: param.id,
    name: param.name,
    field: param.field,
    header: param.header,
    type: param.type,
    category: param.category || 'Custom',
    description: param.description || '',
    source: param.source || 'Custom',
    isFetched: false,
    value: param.value,
    equation: param.equation,
    visible: param.visible,
    removable: param.removable,
    order: param.order
  })

  // Compute unified parameters for parent
  const parentParameters = computed<UnifiedParameter[]>(() => {
    const discovered = discoveredParameters.value.parent.map(convertDiscoveredToUnified)
    const custom = (customParameters.value || []).map(convertCustomToUnified) // Added null check
    return [...discovered, ...custom]
  })

  // Compute unified parameters for child
  const childParameters = computed<UnifiedParameter[]>(() => {
    const discovered = discoveredParameters.value.child.map(convertDiscoveredToUnified)
    const custom = (customParameters.value || []).map(convertCustomToUnified) // Added null check
    return [...discovered, ...custom]
  })

  // Rest of the code remains unchanged
  const updateStore = async () => {
    try {
      debug.startState(DebugCategories.PARAMETERS, 'Updating unified parameters')

      await store.lifecycle.update({
        availableHeaders: {
          parent: parentParameters.value,
          child: childParameters.value
        }
      })

      debug.completeState(DebugCategories.PARAMETERS, 'Updated unified parameters', {
        parentCount: parentParameters.value.length,
        childCount: childParameters.value.length,
        discoveredParent: discoveredParameters.value.parent.length,
        discoveredChild: discoveredParameters.value.child.length,
        customCount: customParameters.value?.length || 0,
        parentGroups: [...new Set(parentParameters.value.map((p) => p.category))],
        childGroups: [...new Set(childParameters.value.map((p) => p.category))]
      })
    } catch (error) {
      debug.error(DebugCategories.ERROR, 'Error updating unified parameters:', error)
      throw error
    }
  }

  watch(
    [discoveredParameters, customParameters],
    async (newValues, oldValues) => {
      const [newDiscovered, _newCustom] = newValues
      const [oldDiscovered, _oldCustom] = oldValues || []

      if (JSON.stringify(newDiscovered) !== JSON.stringify(oldDiscovered)) {
        await updateStore()
      }
    },
    { immediate: true }
  )

  return {
    parentParameters,
    childParameters,
    updateStore
  }
}