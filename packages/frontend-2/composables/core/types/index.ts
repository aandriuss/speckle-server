// Re-export all types from their respective modules

// Common types
export type { BaseItem, BaseBimItem, BaseUserItem, BaseItemType } from './common'

// Data types
export type {
  TableRow,
  ElementsProcessingState,
  ElementsDataReturn,
  ProcessedData,
  DisplayData,
  DataState,
  ProcessingState,
  ParameterValuesRecord
} from './data'

// Element types
export type {
  ElementData,
  ViewerTableRow,
  ElementGroup,
  ElementState
} from './elements'

export {
  createElementData,
  toViewerTableRow,
  isElementData
} from './elements/elements-base'

// Error types
export * from './errors'

// Events
export type {
  BaseEventPayloads,
  ColumnEventPayloads,
  RowEventPayloads,
  DataEventPayloads,
  EventEmits,
  EventHandler,
  EventHandlerProps,
  TableEventPayloads,
  ParameterEventPayloads,
  ScheduleEventPayloads,
  TableEmits,
  ParameterEmits,
  ScheduleEmits,
  TableEventHandler,
  ParameterEventHandler,
  ScheduleEventHandler
} from './events'

// GraphQL types
export type {
  // Parameter Types
  BimGQLParameter,
  UserGQLParameter,
  GQLParameter,

  // Input Types
  CreateBimGQLInput,
  CreateUserGQLInput,
  UpdateBimGQLInput,
  UpdateUserGQLInput,

  // Response Types
  ParametersQueryResponse,
  GetParametersQueryResponse,
  ParameterMutationResponse,
  CreateParameterResponse,
  SingleParameterResponse,
  UpdateParameterResponse,
  DeleteParameterResponse,
  ParametersOperationResponse,

  // Table Types
  TableResponse,
  CreateNamedTableInput,
  UpdateNamedTableInput,
  TablesQueryResponse,
  TablesMutationResponse,
  AddParameterToTableResponse,
  RemoveParameterFromTableResponse
} from './graphql'

// Mappings
export type { ParameterMappings, ParameterTableMapping } from './mappings'

// Parameter System Types
export type {
  // Parameters and Collections
  RawParameter,
  AvailableBimParameter,
  AvailableUserParameter,
  AvailableParameter,
  SelectedParameter,
  ParameterCollections,

  // Value Types
  PrimitiveValue,
  BimValueType,
  UserValueType,
  EquationValue,
  ParameterValue,
  ValidationRules,
  ValidationResult,

  // Backward compatibility
  ParameterDefinition,
  ParameterValueType,
  RawBimParameter,
  ParameterValueState,
  Parameters
} from './parameters'

// Parameter System Functions
export {
  // Constants
  PARAMETER_SETTINGS,

  // Type Guards
  isBimParameter,
  isUserParameter,
  isRawParameter,
  isAvailableBimParameter,
  isAvailableUserParameter,
  isSelectedParameter,

  // Parameter Creation
  createBimParameter,
  createUserParameter,
  createSelectedParameter,

  // Parameter Operations
  convertBimToUserType,
  createAvailableUserParameter,
  isEquationValue,
  isPrimitiveValue
} from './parameters'

// Settings types
export type {
  // Settings Types
  UserSettings,
  SettingsState,
  SettingsUpdatePayload
} from './settings'

// Export settings constants and helpers
export {
  DEFAULT_SETTINGS,
  ensureRequiredSettings,
  getSettingsValue,
  isUserSettings,
  isSettingsUpdatePayload
} from './settings'

// Store types
export type {
  // Parameter Store Types
  StoreParameterValueState,
  StoreBimParameter,
  StoreUserParameter,
  StoreParameterValue,
  BaseStoreParameterDefinition,
  StoreBimParameterDefinition,
  StoreUserParameterDefinition,
  StoreParameterDefinition,

  // Parameter Store State Types
  ParameterStoreState,
  ParameterStoreMutations,
  ParameterStoreGetters,
  ParameterStore,

  // Store State Types
  TableInfo,
  TableHeaders,
  TableInfoUpdatePayload,
  ViewerState,
  StoreState,
  StoreMutations,
  StoreLifecycle,
  Store
} from './store'

// Store utilities and functions
export {
  // Type Guards
  isStoreBimParameter,
  isStoreUserParameter,
  isStoreBimDefinition,
  isStoreUserDefinition,

  // Conversion Utilities
  convertToStoreParameter,
  convertToStoreDefinition,
  convertToParameter,

  // State Factory
  createDefaultParameterStoreState
} from './store'

// Table types
export type {
  // Base Table Types
  BaseTableRow,
  TableColumn,
  TableCategoryFilters,
  TableSelectedParameters,
  BaseTableConfig,

  // Table Events
  ColumnVisibilityPayload,
  ColumnReorderPayload,
  ColumnResizePayload,
  TableUpdatePayload,
  ErrorPayload
} from './tables'

// Table Functions
export { createTableConfig } from '../tables/utils/'

// Validators
export {
  ValidationError,
  isValidTreeItemComponentModel,
  isValidViewerTree,
  isValidArray,
  isValidBIMNodeRaw,
  isValidBIMNodeValue,
  isValidProcessedHeader,
  isValidElementData,
  validateWorldTreeStructure,
  validateElementDataArray
} from './validators'

// Viewer types
export type {
  AvailableHeaders,
  BIMNodeRaw,
  BIMNodeData,
  ViewerTree,
  TreeNode,
  DeepBIMNode,
  NodeModel,
  ProcessedHeader,
  BIMNode,
  BIMNodeValue,
  TreeItemComponentModel,
  ScheduleInitializationInstance,
  ScheduleTreeItemModel,
  NodeConversionResult,
  ViewerNode,
  WorldTreeRoot,
  ViewerNodeRaw
} from './viewer'

export type { TableSettings, TableStoreState, TableStore } from '../tables/store/types'
