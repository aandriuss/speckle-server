import type { ParameterDefinition } from '../../../../parameters/composables/types'

export interface ColumnDef extends ParameterDefinition {
  visible: boolean
  removable?: boolean
  width?: number
  order: number
  headerComponent?: any
}

export interface ColumnGroup {
  category: string
  columns: ColumnDef[]
}

export interface DragItem {
  type: 'column' | 'parameter'
  data: ColumnDef | ParameterDefinition
  sourceIndex: number
  sourceList: 'active' | 'available'
  sourceCategory?: string
}

export interface TableSettings {
  parentColumns: ColumnDef[]
  childColumns: ColumnDef[]
  categoryFilters?: {
    selectedParentCategories: string[]
    selectedChildCategories: string[]
  }
}

export type SortBy = 'name' | 'category' | 'type' | 'fixed'

export interface UseColumnsOptions {
  initialColumns: ColumnDef[]
  searchTerm?: Ref<string>
  isGrouped?: Ref<boolean>
  sortBy?: Ref<'name' | 'category' | 'type' | 'fixed'>
  selectedCategories?: Ref<string[]>
  onUpdate?: (columns: ColumnDef[]) => void
}
