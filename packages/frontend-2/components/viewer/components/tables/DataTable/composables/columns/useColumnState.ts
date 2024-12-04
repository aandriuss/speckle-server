import { ref, computed, watch } from 'vue'
import type { ColumnDef, ParameterDefinition } from '~/composables/core/types'
import { useUserSettings } from '~/composables/useUserSettings'
import {
  defaultColumns,
  defaultDetailColumns
} from '~/components/viewer/schedules/config/defaultColumns'
import { debug, DebugCategories } from '~/components/viewer/schedules/debug/useDebug'

export interface UseColumnStateOptions {
  tableId: string
  initialParentColumns: ColumnDef[]
  initialChildColumns: ColumnDef[]
  availableParentParameters: ParameterDefinition[]
  availableChildParameters: ParameterDefinition[]
}

export interface DragItem {
  item: ColumnDef | ParameterDefinition
  sourceList: 'active' | 'available'
}

interface PendingOperation {
  id: string
  type:
    | 'ADD_COLUMN'
    | 'REMOVE_COLUMN'
    | 'REORDER'
    | 'UPDATE_VISIBILITY'
    | 'UPDATE_FILTERS'
  targetView: 'parent' | 'child'
  data: Record<string, unknown>
  timestamp: number
}

export function useColumnState({
  tableId,
  initialParentColumns,
  initialChildColumns,
  availableParentParameters,
  availableChildParameters
}: UseColumnStateOptions) {
  // Modified validation to support progressive loading
  const validateColumns = (cols: ColumnDef[]): ColumnDef[] => {
    if (!Array.isArray(cols) || cols.length === 0) {
      debug.log(DebugCategories.COLUMNS, 'Using default columns due to invalid input')
      return defaultColumns
    }

    // Ensure essential columns exist
    const essentialFields = ['mark', 'category']
    const hasEssentials = essentialFields.every((field) =>
      cols.some((col) => col.field === field)
    )

    if (!hasEssentials) {
      debug.log(DebugCategories.COLUMNS, 'Adding missing essential columns')
      const missingColumns = defaultColumns.filter(
        (defaultCol) =>
          essentialFields.includes(defaultCol.field) &&
          !cols.some((col) => col.field === defaultCol.field)
      )
      return [...missingColumns, ...cols]
    }

    return cols
  }

  // User settings
  const { settings, updateNamedTable } = useUserSettings()

  // View state
  const currentView = ref<'parent' | 'child'>('parent')

  // Column state with progressive loading
  const parentColumns = ref<ColumnDef[]>([])
  const childColumns = ref<ColumnDef[]>([])
  const isLoadingColumns = ref(true)

  // Loading state
  const settingsLoading = ref(false)
  const isUpdating = ref(false)
  const initialized = ref(false)
  const isDirty = ref(false)

  const pendingOperations = ref<PendingOperation[]>([])

  const draggedItem = ref<{
    item: ColumnDef | ParameterDefinition
    sourceList: 'active' | 'available'
    sourceIndex: number
  } | null>(null)

  // Initialize columns progressively
  function initializeColumns() {
    try {
      isLoadingColumns.value = true

      // Start with essential columns
      const essentialFields = ['mark', 'category']
      const essentialParentColumns = defaultColumns.filter((col) =>
        essentialFields.includes(col.field)
      )
      const essentialChildColumns = defaultDetailColumns.filter((col) =>
        essentialFields.includes(col.field)
      )

      parentColumns.value = essentialParentColumns
      childColumns.value = essentialChildColumns

      // Mark as initialized to allow initial display
      initialized.value = true

      // Queue loading of remaining columns
      queueMicrotask(() => {
        try {
          const validatedParentColumns = validateColumns(initialParentColumns)
          const validatedChildColumns = validateColumns(initialChildColumns)

          parentColumns.value = validatedParentColumns
          childColumns.value = validatedChildColumns

          debug.log(DebugCategories.COLUMNS, 'Columns fully initialized:', {
            parentCount: validatedParentColumns.length,
            childCount: validatedChildColumns.length,
            timestamp: new Date().toISOString()
          })
        } catch (error) {
          debug.error(DebugCategories.ERROR, 'Error loading full columns:', error)
        } finally {
          isLoadingColumns.value = false
        }
      })
    } catch (error) {
      debug.error(DebugCategories.ERROR, 'Error initializing columns:', error)
      isLoadingColumns.value = false
      throw error
    }
  }

  async function saveColumnState() {
    if (!initialized.value) {
      debug.log(DebugCategories.COLUMNS, 'Not saving - not initialized')
      return
    }

    isUpdating.value = true
    try {
      const currentSettings = settings.value?.namedTables?.[tableId]
      if (!currentSettings) {
        debug.warn(
          DebugCategories.COLUMNS,
          'No current settings found for table:',
          tableId
        )
        return
      }

      const updatedColumns = {
        ...currentSettings,
        parentColumns: parentColumns.value.map((col: ColumnDef, index: number) => ({
          ...col,
          order: index,
          visible: col.visible ?? true,
          removable: col.removable ?? true
        })),
        childColumns: childColumns.value.map((col: ColumnDef, index: number) => ({
          ...col,
          order: index,
          visible: col.visible ?? true,
          removable: col.removable ?? true
        }))
      }

      debug.log(DebugCategories.COLUMNS, 'Saving column state:', {
        parentColumnsCount: updatedColumns.parentColumns.length,
        childColumnsCount: updatedColumns.childColumns.length,
        timestamp: new Date().toISOString()
      })

      await updateNamedTable(tableId, updatedColumns)
      isDirty.value = false
    } catch (error) {
      debug.error(DebugCategories.ERROR, 'Failed to save column state:', error)
      throw error
    } finally {
      isUpdating.value = false
    }
  }

  // Computed values
  const activeColumns = computed(() => {
    return currentView.value === 'parent' ? parentColumns.value : childColumns.value
  })

  const availableParameters = computed(() => {
    const params =
      currentView.value === 'parent'
        ? availableParentParameters
        : availableChildParameters

    return params
  })

  // Initialize columns on setup
  initializeColumns()

  // Watch for column changes
  watch(
    [parentColumns, childColumns],
    async (newVal, oldVal) => {
      if (
        !isUpdating.value &&
        initialized.value &&
        JSON.stringify(newVal) !== JSON.stringify(oldVal)
      ) {
        debug.log(DebugCategories.COLUMNS, 'Columns changed, saving state:', {
          parentCount: parentColumns.value.length,
          childCount: childColumns.value.length,
          timestamp: new Date().toISOString()
        })
        await saveColumnState()
      }
    },
    { deep: true }
  )

  return {
    // State
    currentView,
    parentColumns,
    childColumns,
    activeColumns,
    availableParameters,
    isDirty,
    pendingOperations,
    draggedItem,
    settings,
    settingsLoading,
    isUpdating,
    initialized,
    isLoadingColumns,

    // Methods
    saveColumnState,
    initializeColumns,
    setView: (view: 'parent' | 'child') => {
      currentView.value = view
    }
  }
}
