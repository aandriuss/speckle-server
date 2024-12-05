import { ref, watch } from 'vue'
import { debug, DebugCategories } from '~/components/viewer/schedules/debug/useDebug'
import { useTablesGraphQL } from './useTablesGraphQL'
import { useUpdateQueue } from '../useUpdateQueue'
import type { NamedTableConfig, TablesState } from '~/composables/core/types'
import { defaultTable } from '~/components/viewer/schedules/config/defaultColumns'

export function useTablesState() {
  // Initialize with default table
  const state = ref<TablesState>({
    tables: {
      defaultTable
    },
    loading: false,
    error: null
  })

  const isUpdating = ref(false)
  const lastUpdateTime = ref(0)
  const selectedTableId = ref<string | null>(null)

  // Initialize GraphQL operations
  const { result, queryLoading, fetchTables, updateTables } = useTablesGraphQL()
  const { queueUpdate } = useUpdateQueue()

  function formatTableKey(table: NamedTableConfig): string {
    // Create a key in format name_id
    const sanitizedName = table.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
    return `${sanitizedName}_${table.id}`
  }

  // Watch for tables changes
  watch(
    () => result.value?.activeUser?.tables,
    (newTables) => {
      // Skip if we're updating or if this is a response to our own update
      const timeSinceLastUpdate = Date.now() - lastUpdateTime.value
      if (isUpdating.value || timeSinceLastUpdate < 500) {
        debug.log(
          DebugCategories.INITIALIZATION,
          'Skipping tables update during local change',
          { isUpdating: isUpdating.value, timeSinceLastUpdate }
        )
        return
      }

      debug.log(DebugCategories.INITIALIZATION, 'Raw tables received', {
        hasTables: !!newTables,
        tableCount: newTables ? Object.keys(newTables).length : 0
      })

      // Update tables in state
      if (newTables) {
        const processedTables: Record<string, NamedTableConfig> = {
          defaultTable
        }

        // Process tables from the nested structure
        Object.entries(newTables).forEach(([_, table]) => {
          if (table && typeof table === 'object' && 'id' in table && 'name' in table) {
            const validatedTable: NamedTableConfig = {
              id: table.id as string,
              name: table.name as string,
              displayName:
                (table as NamedTableConfig).displayName || (table.name as string),
              parentColumns: Array.isArray((table as NamedTableConfig).parentColumns)
                ? (table as NamedTableConfig).parentColumns
                : [],
              childColumns: Array.isArray((table as NamedTableConfig).childColumns)
                ? (table as NamedTableConfig).childColumns
                : [],
              categoryFilters: (table as NamedTableConfig).categoryFilters || {
                selectedParentCategories: [],
                selectedChildCategories: []
              },
              selectedParameterIds: Array.isArray(
                (table as NamedTableConfig).selectedParameterIds
              )
                ? (table as NamedTableConfig).selectedParameterIds
                : [],
              description: (table as NamedTableConfig).description
            }
            const key = formatTableKey(validatedTable)
            processedTables[key] = validatedTable

            // Re-select table if it was previously selected
            if (validatedTable.id === selectedTableId.value) {
              selectTable(validatedTable.id)
            }
          }
        })

        state.value = {
          ...state.value,
          tables: processedTables
        }
      } else {
        state.value = {
          ...state.value,
          tables: { defaultTable }
        }
      }
    },
    { deep: true }
  )

  async function loadTables(): Promise<void> {
    try {
      debug.startState(DebugCategories.INITIALIZATION, 'Loading tables')
      state.value.loading = true
      state.value.error = null

      const tables = await fetchTables()

      // Remember selected table ID
      const currentSelectedId = selectedTableId.value

      // Merge with default table
      state.value.tables = {
        defaultTable,
        ...tables
      }

      // Restore selected table if it still exists
      if (currentSelectedId) {
        const tableExists = Object.values(tables).some(
          (table) => table.id === currentSelectedId
        )
        if (tableExists) {
          selectTable(currentSelectedId)
        }
      }

      debug.log(DebugCategories.INITIALIZATION, 'Tables loaded', {
        tablesCount: Object.keys(state.value.tables).length,
        selectedTableId: selectedTableId.value
      })

      debug.completeState(DebugCategories.INITIALIZATION, 'Tables loaded successfully')
    } catch (err) {
      debug.error(DebugCategories.ERROR, 'Failed to load tables', err)
      state.value.error =
        err instanceof Error ? err : new Error('Failed to load tables')
      // Use default table on error
      state.value.tables = { defaultTable }
    } finally {
      state.value.loading = false
    }
  }

  async function saveTables(
    newTables: Record<string, NamedTableConfig>
  ): Promise<boolean> {
    return queueUpdate(async () => {
      try {
        debug.startState(DebugCategories.STATE, 'Saving tables')
        state.value.loading = true
        state.value.error = null
        isUpdating.value = true
        lastUpdateTime.value = Date.now()

        debug.log(DebugCategories.STATE, 'Saving tables', {
          currentCount: Object.keys(state.value.tables).length,
          newCount: Object.keys(newTables).length
        })

        // Remember selected table ID
        const currentSelectedId = selectedTableId.value

        // Get existing tables from state, excluding default table
        const existingTables = Object.entries(state.value.tables).reduce<
          Record<string, NamedTableConfig>
        >((acc, [key, table]) => {
          if (table.id === defaultTable.id) return acc
          return { ...acc, [key]: table }
        }, {})

        // Merge existing tables with new tables
        const mergedTables = {
          ...existingTables,
          ...Object.entries(newTables).reduce<Record<string, NamedTableConfig>>(
            (acc, [_, table]) => {
              if (table.id === defaultTable.id) return acc
              const validatedTable: NamedTableConfig = {
                id: table.id,
                name: table.name,
                displayName: table.displayName || table.name,
                parentColumns: Array.isArray(table.parentColumns)
                  ? table.parentColumns
                  : [],
                childColumns: Array.isArray(table.childColumns)
                  ? table.childColumns
                  : [],
                categoryFilters: table.categoryFilters || {
                  selectedParentCategories: [],
                  selectedChildCategories: []
                },
                selectedParameterIds: Array.isArray(table.selectedParameterIds)
                  ? table.selectedParameterIds
                  : [],
                description: table.description
              }
              const key = formatTableKey(validatedTable)
              return { ...acc, [key]: validatedTable }
            },
            {}
          )
        }

        const success = await updateTables(mergedTables)
        if (success) {
          state.value.tables = {
            defaultTable,
            ...mergedTables
          }

          // Restore selected table if it still exists
          if (currentSelectedId) {
            const tableExists = Object.values(mergedTables).some(
              (table) => table.id === currentSelectedId
            )
            if (tableExists) {
              selectTable(currentSelectedId)
            }
          }
        }

        debug.completeState(DebugCategories.STATE, 'Tables saved')
        return success
      } catch (err) {
        debug.error(DebugCategories.ERROR, 'Failed to save tables', err)
        state.value.error =
          err instanceof Error ? err : new Error('Failed to save tables')
        throw state.value.error
      } finally {
        state.value.loading = false
        isUpdating.value = false
      }
    })
  }

  function selectTable(tableId: string) {
    debug.log(DebugCategories.STATE, 'Selecting table', { tableId })
    selectedTableId.value = tableId
  }

  function deselectTable() {
    debug.log(DebugCategories.STATE, 'Deselecting table')
    selectedTableId.value = null
  }

  function getSelectedTable(): NamedTableConfig | null {
    if (!selectedTableId.value) return null

    // Find table by ID, not by key
    const selectedTable = Object.values(state.value.tables).find(
      (table) => table.id === selectedTableId.value
    )

    if (!selectedTable) {
      debug.warn(DebugCategories.STATE, 'Selected table not found', {
        selectedId: selectedTableId.value,
        availableIds: Object.values(state.value.tables).map((t) => t.id)
      })
      return null
    }

    return selectedTable
  }

  return {
    state,
    loading: state.value.loading || queryLoading.value,
    error: state.value.error,
    isUpdating,
    lastUpdateTime,
    selectedTableId,
    loadTables,
    saveTables,
    selectTable,
    deselectTable,
    getSelectedTable
  }
}
