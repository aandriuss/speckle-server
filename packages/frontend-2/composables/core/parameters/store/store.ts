import { ref, computed } from 'vue'
import type {
  RawParameter,
  AvailableBimParameter,
  AvailableUserParameter,
  SelectedParameter,
  ParameterCollections
} from './types'
import { createAvailableUserParameter } from './types'
import { debug, DebugCategories } from '~/composables/core/utils/debug'
import {
  processRawParameters as processParams,
  createSelectedParameters,
  createColumnDefinitions
} from '../next/utils/parameter-processing'
import type { UserValueType, ParameterValue } from '~/composables/core/types/parameters'

/**
 * Parameter store state interface
 */
interface ParameterStoreState {
  collections: ParameterCollections
  loading: boolean
  error: Error | null
  isProcessing: boolean
  lastUpdated: number
}

/**
 * Create initial parameter collections
 */
function createInitialCollections(): ParameterCollections {
  return {
    parent: {
      raw: [],
      available: {
        bim: [],
        user: []
      },
      selected: [],
      columns: []
    },
    child: {
      raw: [],
      available: {
        bim: [],
        user: []
      },
      selected: [],
      columns: []
    }
  }
}

/**
 * Create parameter store
 */
function createParameterStore() {
  // Internal state
  const state = ref<ParameterStoreState>({
    collections: createInitialCollections(),
    loading: false,
    error: null,
    isProcessing: false,
    lastUpdated: Date.now()
  })

  // Computed collections
  const parentCollections = computed(() => state.value.collections.parent)
  const childCollections = computed(() => state.value.collections.child)

  // Parent parameters
  const parentRawParameters = computed(() => parentCollections.value.raw)
  const parentAvailableBimParameters = computed(
    () => parentCollections.value.available.bim
  )
  const parentAvailableUserParameters = computed(
    () => parentCollections.value.available.user
  )
  const parentSelectedParameters = computed(() => parentCollections.value.selected)
  const parentColumnDefinitions = computed(() => parentCollections.value.columns)

  // Child parameters
  const childRawParameters = computed(() => childCollections.value.raw)
  const childAvailableBimParameters = computed(
    () => childCollections.value.available.bim
  )
  const childAvailableUserParameters = computed(
    () => childCollections.value.available.user
  )
  const childSelectedParameters = computed(() => childCollections.value.selected)
  const childColumnDefinitions = computed(() => childCollections.value.columns)

  // Status
  const isLoading = computed(() => state.value.loading)
  const isProcessing = computed(() => state.value.isProcessing)
  const error = computed(() => state.value.error)
  const hasError = computed(() => state.value.error !== null)
  const lastUpdated = computed(() => state.value.lastUpdated)

  /**
   * Process raw parameters into available parameters
   * Creates default selected parameters if none exist
   */
  async function processRawParameters(parameters: RawParameter[], isParent: boolean) {
    try {
      state.value.isProcessing = true
      state.value.loading = true
      const target = isParent ? 'parent' : 'child'

      debug.log(DebugCategories.PARAMETERS, 'Starting parameter processing', {
        count: parameters.length,
        isParent,
        target,
        sample: parameters[0]
      })

      // Process parameters first before modifying state
      const processed = await processParams(parameters)
      if (!processed?.length) {
        debug.error(DebugCategories.PARAMETERS, 'No parameters processed', {
          input: parameters.length,
          raw: parameters.length,
          sample: parameters[0]
        })
        throw new Error('No parameters processed')
      }

      // Separate BIM and user parameters using kind discriminator
      const bimParams = processed.filter(
        (p): p is AvailableBimParameter => p.kind === 'bim'
      )
      const userParams = processed.filter(
        (p): p is AvailableUserParameter => p.kind === 'user'
      )

      debug.log(DebugCategories.PARAMETERS, 'Raw parameters processed', {
        count: processed.length,
        bim: bimParams.length,
        user: userParams.length,
        sample: processed[0]
      })

      // Create new collections with processed parameters
      const newCollections = {
        ...state.value.collections,
        [target]: {
          raw: parameters,
          available: {
            bim: bimParams,
            user: userParams
          },
          selected: [],
          columns: []
        }
      }

      // Update state with new collections
      state.value.collections = newCollections

      // Log state after update
      debug.log(DebugCategories.PARAMETERS, 'Parameter state after update', {
        target,
        raw: parameters.length,
        state: {
          raw: state.value.collections[target].raw.length,
          available: {
            bim: state.value.collections[target].available.bim.length,
            user: state.value.collections[target].available.user.length
          },
          selected: state.value.collections[target].selected.length,
          columns: state.value.collections[target].columns.length
        }
      })

      // Log parameter groups and nested parameters
      const groups = new Set<string>()
      const nestedParams = new Set<string>()
      parameters.forEach((param) => {
        if (param.sourceGroup) groups.add(param.sourceGroup)
        if (param.metadata?.isNested) {
          nestedParams.add(`${param.metadata.parentKey}.${param.name}`)
        }
      })

      debug.log(DebugCategories.PARAMETERS, 'Parameter groups and nesting', {
        target,
        groups: Array.from(groups),
        nestedParameters: Array.from(nestedParams),
        state: {
          raw: state.value.collections[target].raw.length,
          available: {
            bim: state.value.collections[target].available.bim.length,
            user: state.value.collections[target].available.user.length
          }
        }
      })

      // Create default selected parameters if none exist
      if (state.value.collections[target].selected.length === 0) {
        debug.log(DebugCategories.PARAMETERS, 'Creating default parameter selections')

        // Combine BIM and user parameters
        const availableParams = [
          ...state.value.collections[target].available.bim,
          ...state.value.collections[target].available.user
        ]

        debug.log(DebugCategories.PARAMETERS, 'Available parameters for selection', {
          total: availableParams.length,
          bim: state.value.collections[target].available.bim.length,
          user: state.value.collections[target].available.user.length,
          sample: availableParams[0]
        })

        // Create selected parameters with defaults
        const selectedParams = createSelectedParameters(availableParams)

        // Create column definitions
        const columnDefs = createColumnDefinitions(selectedParams)

        // Update store
        state.value.collections[target].selected = selectedParams
        state.value.collections[target].columns = columnDefs

        debug.log(DebugCategories.PARAMETERS, 'Default selections created', {
          selectedCount: selectedParams.length,
          columnsCount: columnDefs.length,
          sample: selectedParams[0],
          groups: Array.from(new Set(selectedParams.map((p) => p.group)))
        })
      }

      // Verify state after processing
      const currentState = state.value.collections[target]
      if (!currentState.raw.length || !currentState.available.bim.length) {
        throw new Error('Parameter state verification failed')
      }

      debug.log(DebugCategories.PARAMETERS, 'Parameter processing complete', {
        raw: parameters.length,
        available: processed.length,
        collections: {
          raw: currentState.raw.length,
          available: {
            bim: currentState.available.bim.length,
            user: currentState.available.user.length
          },
          selected: currentState.selected.length,
          columns: currentState.columns.length
        }
      })

      state.value.lastUpdated = Date.now()
      state.value.error = null
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      debug.error(DebugCategories.PARAMETERS, 'Parameter processing failed:', error)
      state.value.error = error
      throw error
    } finally {
      state.value.isProcessing = false
      state.value.loading = false
    }
  }

  /**
   * Update selected parameters and create corresponding column definitions
   */
  function updateSelectedParameters(
    selectedParameters: SelectedParameter[],
    isParent: boolean
  ) {
    const target = isParent ? 'parent' : 'child'

    // Update selected parameters
    state.value.collections[target].selected = selectedParameters

    // Create column definitions for selected parameters
    const columns = createColumnDefinitions(selectedParameters)
    state.value.collections[target].columns = columns

    state.value.lastUpdated = Date.now()

    debug.log(DebugCategories.PARAMETERS, 'Selected parameters updated', {
      count: selectedParameters.length,
      visible: selectedParameters.filter((p) => p.visible).length,
      collections: {
        selected: state.value.collections[target].selected.length,
        columns: state.value.collections[target].columns.length,
        visibleColumns: columns.filter((c) => c.visible).length
      }
    })
  }

  /**
   * Update parameter visibility and corresponding column definition
   */
  function updateParameterVisibility(
    parameterId: string,
    visible: boolean,
    isParent: boolean
  ) {
    const target = isParent ? 'parent' : 'child'
    const collections = state.value.collections[target]

    // Find parameter in selected parameters
    const selectedParam = collections.selected.find((p) => p.id === parameterId)
    if (selectedParam) {
      selectedParam.visible = visible

      // Update column definitions to match
      const columns = createColumnDefinitions(collections.selected)
      collections.columns = columns

      state.value.lastUpdated = Date.now()

      debug.log(DebugCategories.PARAMETERS, 'Parameter visibility updated', {
        id: parameterId,
        visible,
        collections: {
          selected: collections.selected.length,
          columns: collections.columns.length,
          visibleColumns: columns.filter((c) => c.visible).length
        }
      })
    }
  }

  /**
   * Update parameter order and sort columns accordingly
   */
  function updateParameterOrder(parameterId: string, order: number, isParent: boolean) {
    const target = isParent ? 'parent' : 'child'
    const collections = state.value.collections[target]

    // Find parameter in selected parameters
    const selectedParam = collections.selected.find((p) => p.id === parameterId)
    if (selectedParam) {
      selectedParam.order = order

      // Sort selected parameters by order
      collections.selected.sort((a, b) => a.order - b.order)

      // Update column definitions to match
      const columns = createColumnDefinitions(collections.selected)
      collections.columns = columns.sort((a, b) => a.order - b.order)

      state.value.lastUpdated = Date.now()

      debug.log(DebugCategories.PARAMETERS, 'Parameter order updated', {
        id: parameterId,
        order,
        collections: {
          selected: collections.selected.length,
          columns: collections.columns.length
        }
      })
    }
  }

  /**
   * Reorder parameters and update column order
   */
  function reorderParameters(dragIndex: number, dropIndex: number, isParent: boolean) {
    const target = isParent ? 'parent' : 'child'
    const collections = state.value.collections[target]

    // Reorder selected parameters
    const [movedParam] = collections.selected.splice(dragIndex, 1)
    collections.selected.splice(dropIndex, 0, movedParam)

    // Update order values
    collections.selected.forEach((param, index) => {
      param.order = index
    })

    // Update column definitions to match
    const columns = createColumnDefinitions(collections.selected)
    collections.columns = columns

    state.value.lastUpdated = Date.now()

    debug.log(DebugCategories.PARAMETERS, 'Parameters reordered', {
      fromIndex: dragIndex,
      toIndex: dropIndex,
      collections: {
        selected: collections.selected.length,
        columns: collections.columns.length
      }
    })
  }

  /**
   * Add user parameter to available parameters
   */
  function addUserParameter(
    isParent: boolean,
    name: string,
    type: UserValueType,
    group: string,
    value: ParameterValue
  ) {
    const target = isParent ? 'parent' : 'child'
    const collections = state.value.collections[target]
    const id = `user-${Date.now()}`

    const parameter = createAvailableUserParameter(id, name, type, value, group)
    collections.available.user.push(parameter)

    state.value.lastUpdated = Date.now()

    debug.log(DebugCategories.PARAMETERS, 'User parameter added', {
      id,
      name,
      type,
      group,
      collections: {
        available: {
          user: collections.available.user.length
        }
      }
    })
  }

  /**
   * Remove parameter from available parameters
   */
  function removeParameter(isParent: boolean, parameterId: string) {
    const target = isParent ? 'parent' : 'child'
    const collections = state.value.collections[target]

    // Remove from available parameters
    collections.available.bim = collections.available.bim.filter(
      (p) => p.id !== parameterId
    )
    collections.available.user = collections.available.user.filter(
      (p) => p.id !== parameterId
    )

    state.value.lastUpdated = Date.now()

    debug.log(DebugCategories.PARAMETERS, 'Parameter removed', {
      id: parameterId,
      collections: {
        available: {
          bim: collections.available.bim.length,
          user: collections.available.user.length
        }
      }
    })
  }

  /**
   * Set raw parameters
   */
  function setRawParameters(parameters: RawParameter[], isParent: boolean) {
    const target = isParent ? 'parent' : 'child'
    state.value.collections[target].raw = parameters
    state.value.lastUpdated = Date.now()
  }

  /**
   * Set available BIM parameters
   */
  function setAvailableBimParameters(
    parameters: AvailableBimParameter[],
    isParent: boolean
  ) {
    const target = isParent ? 'parent' : 'child'
    state.value.collections[target].available.bim = parameters
    state.value.lastUpdated = Date.now()
  }

  /**
   * Set available user parameters
   */
  function setAvailableUserParameters(
    parameters: AvailableUserParameter[],
    isParent: boolean
  ) {
    const target = isParent ? 'parent' : 'child'
    state.value.collections[target].available.user = parameters
    state.value.lastUpdated = Date.now()
  }

  /**
   * Set loading state
   */
  function setLoading(loading: boolean) {
    state.value.loading = loading
  }

  /**
   * Set error state
   */
  function setError(error: Error | null) {
    state.value.error = error
    if (error) {
      debug.error(DebugCategories.PARAMETERS, 'Parameter store error:', error)
    }
  }

  /**
   * Reset store state
   */
  function reset() {
    state.value = {
      collections: createInitialCollections(),
      loading: false,
      error: null,
      isProcessing: false,
      lastUpdated: Date.now()
    }
  }

  /**
   * Initialize store
   * Must be called before any parameter processing
   */
  async function init() {
    try {
      debug.startState(DebugCategories.INITIALIZATION, 'Initializing parameter store')
      state.value.loading = true
      state.value.isProcessing = true

      // Reset to initial state
      state.value.collections = createInitialCollections()

      // Wait for Vue reactivity to ensure clean state
      await new Promise((resolve) => setTimeout(resolve, 0))

      // Verify store state
      if (!state.value.collections.parent || !state.value.collections.child) {
        throw new Error('Failed to initialize parameter collections')
      }

      debug.log(DebugCategories.INITIALIZATION, 'Parameter store initialized', {
        collections: state.value.collections,
        timestamp: state.value.lastUpdated
      })

      state.value.error = null
      state.value.lastUpdated = Date.now()

      // Wait for final state update
      await new Promise((resolve) => setTimeout(resolve, 0))
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      debug.error(
        DebugCategories.INITIALIZATION,
        'Parameter store initialization failed:',
        error
      )
      state.value.error = error
      throw error
    } finally {
      state.value.loading = false
      state.value.isProcessing = false
    }
  }

  return {
    // State
    state: computed(() => state.value),

    // Initialization
    init,

    // Collections
    parentCollections,
    childCollections,

    // Parent parameters
    parentRawParameters,
    parentAvailableBimParameters,
    parentAvailableUserParameters,
    parentSelectedParameters,
    parentColumnDefinitions,

    // Child parameters
    childRawParameters,
    childAvailableBimParameters,
    childAvailableUserParameters,
    childSelectedParameters,
    childColumnDefinitions,

    // Status
    isLoading,
    isProcessing,
    error,
    hasError,
    lastUpdated,

    // Parameter processing
    processRawParameters,
    updateSelectedParameters,

    // Parameter management
    addUserParameter,
    removeParameter,
    updateParameterVisibility,
    updateParameterOrder,
    reorderParameters,

    // Basic operations
    setRawParameters,
    setAvailableBimParameters,
    setAvailableUserParameters,
    setLoading,
    setError,
    reset
  }
}

export type ParameterStore = ReturnType<typeof createParameterStore>

// Global store instance
const store = createParameterStore()

/**
 * Parameter store composable
 * Provides access to the global parameter store instance
 */
export function useParameterStore() {
  return store
}
