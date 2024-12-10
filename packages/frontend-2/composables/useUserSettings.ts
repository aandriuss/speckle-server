import { useUserSettingsState } from './settings/userSettings'
import { useTablesState, useTableOperations } from './settings/tables'
import { debug, DebugCategories } from '~/composables/core/utils/debug'

export function useUserSettings() {
  // User settings (controlWidth)
  const {
    state: userSettingsState,
    loading: userSettingsLoading,
    error: userSettingsError,
    loadControlWidth,
    saveControlWidth
  } = useUserSettingsState()

  // Tables
  const {
    state: tablesState,
    loading: tablesLoading,
    error: tablesError,
    loadTables,
    saveTables,
    selectTable,
    deselectTable,
    selectedTableId,
    getSelectedTable
  } = useTablesState()

  // Table operations
  const { updateTable, updateTableCategories, updateTableColumns, createNamedTable } =
    useTableOperations({
      settings: {
        value: {
          get namedTables() {
            return tablesState.value.tables || {}
          }
        }
      },
      saveTables,
      selectTable
    })

  // Combined loading and error states
  const loading = userSettingsLoading || tablesLoading
  const error = userSettingsError || tablesError

  // Combined settings object for backwards compatibility
  const settings = {
    get value() {
      return {
        controlWidth: userSettingsState.value.controlWidth,
        namedTables: tablesState.value.tables || {},
        customParameters: [] // Parameters will be handled separately
      }
    }
  }

  // Load all settings
  async function loadSettings(): Promise<void> {
    try {
      debug.startState(DebugCategories.INITIALIZATION, 'Loading settings')

      // Load control width first
      await loadControlWidth()

      // Then load tables
      await loadTables()

      debug.completeState(
        DebugCategories.INITIALIZATION,
        'Settings loaded successfully'
      )
    } catch (err) {
      debug.error(DebugCategories.ERROR, 'Failed to load settings', err)
      throw err instanceof Error ? err : new Error('Failed to load settings')
    }
  }

  return {
    settings,
    loading,
    error,
    loadSettings,
    // User settings operations
    saveControlWidth,
    // Table operations
    saveTables,
    updateTable,
    updateTableCategories,
    updateTableColumns,
    createNamedTable,
    // Table selection
    selectTable,
    deselectTable,
    selectedTableId,
    getSelectedTable,
    cleanup: () => {
      // No cleanup needed for now
    }
  }
}
