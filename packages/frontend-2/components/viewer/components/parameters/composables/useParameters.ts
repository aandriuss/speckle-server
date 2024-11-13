import { ref, computed } from 'vue'
import type { Ref } from 'vue'

export interface ParameterDefinition {
  field: string
  header: string
  type?: string
  description?: string
  category?: string
  isFixed?: boolean
}

export interface UseParametersOptions {
  initialParameters: ParameterDefinition[]
  searchTerm?: Ref<string>
  isGrouped?: Ref<boolean>
  sortBy?: Ref<'name' | 'category' | 'type' | 'fixed'>
  selectedCategories?: Ref<string[]>
  selectedTypes?: Ref<string[]>
}

export function useParameters({
  initialParameters,
  searchTerm = ref(''),
  isGrouped = ref(true),
  sortBy = ref('category' as const),
  selectedCategories = ref([]),
  selectedTypes = ref([])
}: UseParametersOptions) {
  const parameters = ref<ParameterDefinition[]>(initialParameters)

  // Base filtered parameters before grouping
  const filteredParameters = computed(() => {
    let result = [...parameters.value]

    // Apply category filter
    if (selectedCategories.value.length) {
      result = result.filter(
        (param) => param.category && selectedCategories.value.includes(param.category)
      )
    }

    // Apply type filter
    if (selectedTypes.value.length) {
      result = result.filter(
        (param) => param.type && selectedTypes.value.includes(param.type)
      )
    }

    // Apply search filter
    if (searchTerm.value) {
      const normalizedSearch = searchTerm.value.toLowerCase().trim()
      result = result.filter(
        (param) =>
          param.header.toLowerCase().includes(normalizedSearch) ||
          param.field.toLowerCase().includes(normalizedSearch) ||
          param.category?.toLowerCase().includes(normalizedSearch) ||
          param.type?.toLowerCase().includes(normalizedSearch) ||
          param.description?.toLowerCase().includes(normalizedSearch)
      )
    }

    // Apply sorting
    return [...result].sort((a, b) => {
      switch (sortBy.value) {
        case 'name':
          return a.header.localeCompare(b.header)
        case 'category':
          return (a.category || 'Other').localeCompare(b.category || 'Other')
        case 'type':
          return (a.type || '').localeCompare(b.type || '')
        case 'fixed':
          if (a.isFixed === b.isFixed) {
            return a.header.localeCompare(b.header)
          }
          return a.isFixed ? -1 : 1
        default:
          return 0
      }
    })
  })

  // Grouped parameters
  const groupedParameters = computed(() => {
    if (!isGrouped.value) return []

    const groups: Record<string, ParameterDefinition[]> = {}

    filteredParameters.value.forEach((param) => {
      const category = param.category || 'Other'
      if (!groups[category]) {
        groups[category] = []
      }
      groups[category].push(param)
    })

    return Object.entries(groups)
      .map(([category, parameters]) => ({
        category,
        parameters: parameters.sort((a, b) => a.header.localeCompare(b.header))
      }))
      .sort((a, b) => a.category.localeCompare(b.category))
  })

  // Statistics and metadata
  const stats = computed(() => ({
    total: parameters.value.length,
    filtered: filteredParameters.value.length,
    fixedCount: parameters.value.filter((p) => p.isFixed).length,
    categories: getUniqueCategories(parameters.value),
    types: getUniqueTypes(parameters.value),
    groupCount: groupedParameters.value.length
  }))

  // Utility functions
  function getUniqueCategories(params: ParameterDefinition[]): string[] {
    return [...new Set(params.filter((p) => p.category).map((p) => p.category!))]
  }

  function getUniqueTypes(params: ParameterDefinition[]): string[] {
    return [...new Set(params.filter((p) => p.type).map((p) => p.type!))]
  }

  function updateParameters(newParameters: ParameterDefinition[]) {
    parameters.value = newParameters
  }

  function toggleCategory(category: string) {
    const current = [...selectedCategories.value]
    const index = current.indexOf(category)
    if (index === -1) {
      current.push(category)
    } else {
      current.splice(index, 1)
    }
    selectedCategories.value = current
  }

  function toggleType(type: string) {
    const current = [...selectedTypes.value]
    const index = current.indexOf(type)
    if (index === -1) {
      current.push(type)
    } else {
      current.splice(index, 1)
    }
    selectedTypes.value = current
  }

  return {
    // State
    parameters,
    filteredParameters,
    groupedParameters,
    stats,

    // Methods
    updateParameters,
    toggleCategory,
    toggleType,
    getUniqueCategories,
    getUniqueTypes,

    // Refs for external control
    searchTerm,
    isGrouped,
    sortBy,
    selectedCategories,
    selectedTypes
  }
}