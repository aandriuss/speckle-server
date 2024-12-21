import { ref, computed, type ComputedRef } from 'vue'
import type { NamedTableConfig } from '~/composables/core/types'
import { debug, DebugCategories } from '~/composables/core/utils/debug'
import { defaultTableConfig } from '~/composables/core/tables/config/defaults'
import { useStore } from '~/composables/core/store'

interface UseScheduleFlowOptions {
  currentTable: ComputedRef<NamedTableConfig | null>
}

interface InitializationState {
  initialized: boolean
  loading: boolean
  error: Error | null
}

/**
 * Manages the flow of data and initialization between different parts of the schedule system,
 * ensuring proper type conversion and state management.
 */
export function useScheduleFlow({ currentTable }: UseScheduleFlowOptions) {
  const store = useStore()
  const state = ref<InitializationState>({
    initialized: false,
    loading: false,
    error: null
  })

  // Keep the NamedTableConfig type intact, use defaults if no table
  const tableConfig = computed<NamedTableConfig>(() => {
    const table = currentTable.value
    if (!table) {
      debug.log(DebugCategories.STATE, 'No table available, using defaults', {
        parentColumns: defaultTableConfig.parentColumns.length,
        childColumns: defaultTableConfig.childColumns.length
      })
      return defaultTableConfig
    }

    debug.log(DebugCategories.STATE, 'Processing table config', {
      id: table.id,
      name: table.name,
      parentColumnsCount: table.parentColumns.length,
      childColumnsCount: table.childColumns.length
    })

    // Return table with defaults as fallback
    return {
      ...table,
      parentColumns: table.parentColumns.length
        ? table.parentColumns
        : defaultTableConfig.parentColumns,
      childColumns: table.childColumns.length
        ? table.childColumns
        : defaultTableConfig.childColumns,
      categoryFilters: table.categoryFilters || defaultTableConfig.categoryFilters,
      selectedParameters:
        table.selectedParameters || defaultTableConfig.selectedParameters
    }
  })

  /**
   * Initializes the schedule system.
   * Since we're inside the viewer component, BIM data is already loaded.
   */
  async function initialize() {
    debug.startState(DebugCategories.INITIALIZATION, 'Schedule initialization')
    state.value.loading = true
    state.value.error = null

    try {
      // Only initialize if not already initialized
      if (!store.initialized.value) {
        // Update store state
        await store.lifecycle.update({
          selectedTableId: tableConfig.value.id,
          currentTableId: tableConfig.value.id,
          tableName: tableConfig.value.name,
          selectedParentCategories:
            tableConfig.value.categoryFilters.selectedParentCategories,
          selectedChildCategories:
            tableConfig.value.categoryFilters.selectedChildCategories
        })

        // Set current columns
        store.setCurrentColumns(
          tableConfig.value.parentColumns,
          tableConfig.value.childColumns
        )

        state.value.initialized = true

        debug.log(DebugCategories.INITIALIZATION, 'Schedule initialization complete', {
          storeInitialized: store.initialized.value,
          scheduleInitialized: state.value.initialized,
          tableId: tableConfig.value.id,
          columnsCount: {
            parent: tableConfig.value.parentColumns.length,
            child: tableConfig.value.childColumns.length
          }
        })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      state.value.error = new Error(`Initialization failed: ${errorMessage}`)

      debug.error(DebugCategories.ERROR, 'Initialization failed:', {
        error: err,
        storeState: {
          initialized: store.initialized.value,
          scheduleInitialized: state.value.initialized,
          tableId: tableConfig.value.id
        }
      })
      throw state.value.error
    } finally {
      state.value.loading = false
      debug.completeState(DebugCategories.INITIALIZATION, 'Schedule initialization')
    }
  }

  // Computed properties for state
  const isInitialized = computed(
    () => state.value.initialized && store.initialized.value
  )
  const isLoading = computed(() => state.value.loading)
  const error = computed(() => state.value.error)

  return {
    // Table configuration
    tableConfig,

    // Initialization
    initialize,
    isInitialized,
    isLoading,
    error,

    // State management
    state: computed(() => state.value)
  }
}
