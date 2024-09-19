import {
  Nullable,
  Optional,
  MaybeNullOrUndefined,
  MaybeAsync,
  MaybeFalsy
} from '@speckle/shared'
import { RequestDataLoaders } from '@/modules/core/loaders'
import { AuthContext } from '@/modules/shared/authz'
import { Express } from 'express'
import { ConditionalKeys, SetRequired } from 'type-fest'
import pino from 'pino'
import { BaseContext } from '@apollo/server'
import { OpenAPIV2 } from 'openapi-types'

export type MarkNullableOptional<T> = SetRequired<
  Partial<T>,
  ConditionalKeys<T, NonNullable<unknown>>
>

export const HttpMethod = OpenAPIV2.HttpMethods

export type OpenApiDocument = {
  registerOperation: (
    path: string,
    httpMethod: OpenAPIV2.HttpMethods,
    operation: OpenAPIV2.OperationObject
  ) => void
}

export type SpeckleModule<T extends Record<string, unknown> = Record<string, unknown>> =
  {
    /**
     * Initialize the module
     * @param app The Express instance
     * @param openApiDocument The OpenAPI document to which the route & operation can be registered
     * @param isInitial Whether this initialization method is being invoked for the first time in this
     * process. In tests modules can be initialized multiple times.
     */
    init?: (params: {
      app: Express
      openApiDocument: OpenApiDocument
      isInitial: boolean
    }) => MaybeAsync<void>
    /**
     * Finalize initialization. This is only invoked once all of the other modules' `init()`
     * hooks are run.
     * @param app The Express instance
     * @param isInitial Whether this initialization method is being invoked for the first time in this
     * process. In tests modules can be initialized multiple times.
     */
    finalize?: (app: Express, isInitial: boolean) => MaybeAsync<void>

    /**
     * Cleanup resources before the server shuts down
     */
    shutdown?: () => MaybeAsync<void>
  } & T

export type GraphQLContext = BaseContext &
  AuthContext & {
    /**
     * Request-scoped GraphQL dataloaders
     * @see https://github.com/graphql/dataloader
     */
    loaders: RequestDataLoaders

    log: pino.Logger
  }

export { Nullable, Optional, MaybeNullOrUndefined, MaybeAsync, MaybeFalsy }
