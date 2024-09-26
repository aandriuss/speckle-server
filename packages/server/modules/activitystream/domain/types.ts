import { ActionTypes, ResourceTypes } from '@/modules/activitystream/helpers/types'

export type StreamActionType =
  (typeof ActionTypes.Stream)[keyof (typeof ActionTypes)['Stream']]

export type ResourceType = (typeof ResourceTypes)[keyof typeof ResourceTypes]