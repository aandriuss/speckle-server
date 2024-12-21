/**
 * Core table types
 * These are the primary types used for table functionality
 */

// Column types for display
export * from './table-column'

// Configuration types for table settings
export * from './table-config'

// Event types for table interactions
export * from './table-events'

/**
 * @deprecated All legacy types have been replaced by the core types above.
 * Use the following replacements:
 * - For columns: Use TableColumn from table-column.ts
 * - For events: Use TableEvents from table-events.ts
 * - For config: Use TableConfig from table-config.ts
 */
