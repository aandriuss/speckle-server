import {
  getAutomation,
  getAutomationToken,
  getAutomationTriggerDefinitions
} from '@/modules/automate/repositories/automations'
import {
  AutomationWithRevision,
  AutomationTriggerDefinitionRecord,
  AutomationRevisionWithTriggersFunctions,
  VersionCreatedTriggerManifest,
  VersionCreationTriggerType,
  BaseTriggerManifest,
  isVersionCreatedTriggerManifest,
  InsertableAutomationRun
} from '@/modules/automate/helpers/types'
import { getBranchLatestCommits } from '@/modules/core/repositories/branches'
import { getCommit } from '@/modules/core/repositories/commits'
import { createAppToken } from '@/modules/core/services/tokens'
import { Roles, Scopes } from '@speckle/shared'
import cryptoRandomString from 'crypto-random-string'
import { DefaultAppIds } from '@/modules/auth/defaultApps'
import { Merge } from 'type-fest'
import {
  AutomateInvalidTriggerError,
  AutomationFunctionInputEncryptionError
} from '@/modules/automate/errors/management'
import {
  triggerAutomationRun,
  type TriggeredAutomationFunctionRun
} from '@/modules/automate/clients/executionEngine'
import { TriggerAutomationError } from '@/modules/automate/errors/runs'
import { validateStreamAccess } from '@/modules/core/services/streams/streamAccessService'
import { ContextResourceAccessRules } from '@/modules/core/helpers/token'
import { TokenResourceIdentifierType } from '@/modules/core/graph/generated/graphql'
import { automateLogger } from '@/logging/logging'
import {
  getEncryptionKeyPairFor as getEncryptionKeyPairForFn,
  getFunctionInputDecryptor as getFunctionInputDecryptorFn
} from '@/modules/automate/services/encryption'
import { LibsodiumEncryptionError } from '@/modules/shared/errors/encryption'
import { AutomateRunsEmitter } from '@/modules/automate/events/runs'
import { AutomationRepository } from '@/modules/automate/domain'

/**
 * This should hook into the model version create event
 */
export const onModelVersionCreate =
  ({
    automationRepository,
    triggerFunction
  }: {
    automationRepository: Pick<AutomationRepository, 'queryActiveTriggerDefinitions'>
    triggerFunction: ReturnType<typeof triggerAutomationRevisionRun>
  }) =>
  async (params: { modelId: string; versionId: string; projectId: string }) => {
    const { modelId, versionId, projectId } = params

    // get triggers where modelId matches
    const triggerDefinitions = await automationRepository.queryActiveTriggerDefinitions(
      {
        triggeringId: modelId,
        triggerType: VersionCreationTriggerType
      }
    )

    // get revisions where it matches any of the triggers and the revision is published
    await Promise.all(
      triggerDefinitions.map(async (tr) => {
        try {
          await triggerFunction<VersionCreatedTriggerManifest>({
            revisionId: tr.automationRevisionId,
            manifest: {
              versionId,
              projectId,
              modelId: tr.triggeringId,
              triggerType: tr.triggerType
            }
          })
        } catch (error) {
          // TODO: this error should be persisted for automation status display somehow
          automateLogger.error(
            'Failure while triggering run onModelVersionCreate',
            error,
            params
          )
        }
      })
    )
  }

type InsertableAutomationRunWithExtendedFunctionRuns = Merge<
  InsertableAutomationRun,
  {
    functionRuns: Omit<TriggeredAutomationFunctionRun, 'runId'>[]
  }
>

type CreateAutomationRunDataDeps = {
  getEncryptionKeyPairFor: typeof getEncryptionKeyPairForFn
  getFunctionInputDecryptor: ReturnType<typeof getFunctionInputDecryptorFn>
}

const createAutomationRunData =
  (deps: CreateAutomationRunDataDeps) =>
  async (params: {
    manifests: BaseTriggerManifest[]
    automationWithRevision: AutomationWithRevision<AutomationRevisionWithTriggersFunctions>
  }): Promise<InsertableAutomationRunWithExtendedFunctionRuns> => {
    const { getEncryptionKeyPairFor, getFunctionInputDecryptor } = deps
    const { manifests, automationWithRevision } = params
    const runId = cryptoRandomString({ length: 15 })
    const versionCreatedManifests = manifests.filter(isVersionCreatedTriggerManifest)
    if (!versionCreatedManifests.length) {
      throw new AutomateInvalidTriggerError(
        'Only version creation triggers currently supported'
      )
    }

    const keyPair = await getEncryptionKeyPairFor(
      automationWithRevision.revision.publicKey
    )
    const functionInputDecryptor = await getFunctionInputDecryptor({ keyPair })
    let automationRun: InsertableAutomationRunWithExtendedFunctionRuns
    try {
      automationRun = {
        id: runId,
        triggers: [
          ...versionCreatedManifests.map((m) => ({
            triggeringId: m.versionId,
            triggerType: m.triggerType
          }))
        ],
        executionEngineRunId: null,
        status: 'pending' as const,
        automationRevisionId: automationWithRevision.revision.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        functionRuns: await Promise.all(
          automationWithRevision.revision.functions.map(async (f) => ({
            functionId: f.functionId,
            id: cryptoRandomString({ length: 15 }),
            status: 'pending' as const,
            elapsed: 0,
            results: null,
            contextView: null,
            statusMessage: null,
            resultVersions: [],
            functionReleaseId: f.functionReleaseId,
            functionInputs: await functionInputDecryptor.decryptInputs(
              f.functionInputs
            ),
            createdAt: new Date(),
            updatedAt: new Date()
          }))
        )
      }
    } catch (e) {
      if (e instanceof AutomationFunctionInputEncryptionError) {
        throw new AutomateInvalidTriggerError(
          'One or more function inputs are not proper input objects',
          { cause: e }
        )
      }

      if (e instanceof LibsodiumEncryptionError) {
        throw new AutomateInvalidTriggerError(
          'Failed to decrypt one or more function inputs, they might not have been properly encrypted',
          { cause: e }
        )
      }

      throw e
    } finally {
      functionInputDecryptor.dispose()
    }

    return automationRun
  }

/**
 * This triggers a run for a specific automation revision
 */
export const triggerAutomationRevisionRun =
  ({
    automationRepository,
    automateRunTrigger,
    getEncryptionKeyPairFor,
    getFunctionInputDecryptor
  }: {
    automationRepository: Pick<
      AutomationRepository,
      | 'findFullAutomationRevisionMetadata'
      | 'upsertAutomationRun'
      | 'queryActiveTriggerDefinitions'
    >
    automateRunTrigger: typeof triggerAutomationRun
    getEncryptionKeyPairFor: typeof getEncryptionKeyPairForFn
    getFunctionInputDecryptor: ReturnType<typeof getFunctionInputDecryptorFn>
  }) =>
  async <M extends BaseTriggerManifest = BaseTriggerManifest>(params: {
    revisionId: string
    manifest: M
  }): Promise<{ automationRunId: string }> => {
    const { revisionId, manifest } = params

    if (!isVersionCreatedTriggerManifest(manifest)) {
      throw new AutomateInvalidTriggerError(
        'Only model version triggers are currently supported'
      )
    }

    const { automationWithRevision, userId, automateToken } = await ensureRunConditions(
      {
        automationRepository,
        versionGetter: getCommit,
        automationTokenGetter: getAutomationToken
      }
    )({
      revisionId,
      manifest
    })

    const triggerManifests = await composeTriggerData({
      manifest,
      projectId: automationWithRevision.projectId,
      triggerDefinitions: automationWithRevision.revision.triggers
    })

    // TODO: Q Gergo: Should this really be project scoped?
    const projectScopedToken = await createAppToken({
      appId: DefaultAppIds.Automate,
      name: `at-${automationWithRevision.id}@${manifest.versionId}`,
      userId,
      // for now this is a baked in constant
      // should rely on the function definitions requesting the needed scopes
      scopes: [
        Scopes.Profile.Read,
        Scopes.Streams.Read,
        Scopes.Streams.Write,
        Scopes.Automate.ReportResults
      ],
      limitResources: [
        {
          id: automationWithRevision.projectId,
          type: TokenResourceIdentifierType.Project
        }
      ]
    })

    const automationRun = await createAutomationRunData({
      getEncryptionKeyPairFor,
      getFunctionInputDecryptor
    })({
      manifests: triggerManifests,
      automationWithRevision
    })
    await automationRepository.upsertAutomationRun(automationRun)

    try {
      const { automationRunId } = await automateRunTrigger({
        projectId: automationWithRevision.projectId,
        automationId: automationWithRevision.executionEngineAutomationId,
        manifests: triggerManifests,
        functionRuns: automationRun.functionRuns.map((r) => ({
          ...r,
          runId: automationRun.id
        })),
        speckleToken: projectScopedToken,
        automationToken: automateToken
      })

      automationRun.executionEngineRunId = automationRunId
      await automationRepository.upsertAutomationRun(automationRun)
    } catch (error) {
      const statusMessage = error instanceof Error ? error.message : `${error}`
      automationRun.status = 'exception'
      automationRun.functionRuns = automationRun.functionRuns.map((fr) => ({
        ...fr,
        status: 'exception',
        statusMessage
      }))
      await automationRepository.upsertAutomationRun(automationRun)
    }

    await AutomateRunsEmitter.emit(AutomateRunsEmitter.events.Created, {
      run: automationRun,
      manifests: triggerManifests,
      automation: automationWithRevision
    })

    return { automationRunId: automationRun.id }
  }

export const ensureRunConditions =
  (deps: {
    automationRepository: Pick<
      AutomationRepository,
      'findFullAutomationRevisionMetadata'
    >
    versionGetter: typeof getCommit
    automationTokenGetter: typeof getAutomationToken
  }) =>
  async <M extends BaseTriggerManifest = BaseTriggerManifest>(params: {
    revisionId: string
    manifest: M
  }): Promise<{
    automationWithRevision: AutomationWithRevision<AutomationRevisionWithTriggersFunctions>
    userId: string
    automateToken: string
  }> => {
    const { automationRepository, versionGetter, automationTokenGetter } = deps
    const { revisionId, manifest } = params
    const automationWithRevision =
      await automationRepository.findFullAutomationRevisionMetadata(revisionId)
    if (!automationWithRevision)
      throw new AutomateInvalidTriggerError(
        "Cannot trigger the given revision, it doesn't exist"
      )

    // if the automation is not active, do not trigger
    if (!automationWithRevision.enabled)
      throw new AutomateInvalidTriggerError(
        'The automation is not enabled, cannot trigger it'
      )

    if (!automationWithRevision.revision.active)
      throw new AutomateInvalidTriggerError(
        'The automation revision is not active, cannot trigger it'
      )

    if (!isVersionCreatedTriggerManifest(manifest))
      throw new AutomateInvalidTriggerError('Only model version triggers are supported')

    const triggerDefinition = automationWithRevision.revision.triggers.find((t) => {
      if (t.triggerType !== manifest.triggerType) return false

      if (isVersionCreatedTriggerManifest(manifest)) {
        return t.triggeringId === manifest.modelId
      }

      return false
    })

    if (!triggerDefinition)
      throw new AutomateInvalidTriggerError(
        "The given revision doesn't have a trigger registered matching the input trigger"
      )

    const triggeringVersion = await versionGetter(manifest.versionId)
    if (!triggeringVersion)
      throw new AutomateInvalidTriggerError('The triggering version is not found')

    const userId = triggeringVersion.author
    if (!userId)
      throw new AutomateInvalidTriggerError(
        "The user, that created the triggering version doesn't exist any more"
      )

    const token = await automationTokenGetter(automationWithRevision.id)
    if (!token)
      throw new AutomateInvalidTriggerError('Cannot find a token for the automation')

    return {
      automationWithRevision,
      userId,
      automateToken: token.automateToken
    }
  }

async function composeTriggerData(params: {
  projectId: string
  manifest: BaseTriggerManifest
  // TODO: Q Gergo: What's going on here? Why do we pass in extra unrelated triggers?
  triggerDefinitions: AutomationTriggerDefinitionRecord[]
}): Promise<BaseTriggerManifest[]> {
  const { projectId, manifest, triggerDefinitions } = params

  const manifests: BaseTriggerManifest[] = [{ ...manifest }]

  if (triggerDefinitions.length > 1) {
    const associatedTriggers = triggerDefinitions.filter((t) => {
      if (t.triggerType !== manifest.triggerType) return false

      if (isVersionCreatedTriggerManifest(manifest)) {
        return t.triggeringId === manifest.modelId
      }

      return false
    })

    // Version creation triggers
    if (manifest.triggerType === VersionCreationTriggerType) {
      const latestVersions = await getBranchLatestCommits(
        associatedTriggers.map((t) => t.triggeringId),
        projectId
      )
      manifests.push(
        ...latestVersions.map(
          (version): VersionCreatedTriggerManifest => ({
            modelId: version.branchId,
            projectId,
            versionId: version.id,
            triggerType: VersionCreationTriggerType
          })
        )
      )
    }
  }

  return manifests
}

export type ManuallyTriggerAutomationDeps = {
  getAutomationTriggerDefinitions: typeof getAutomationTriggerDefinitions
  getAutomation: typeof getAutomation
  getBranchLatestCommits: typeof getBranchLatestCommits
  triggerFunction: ReturnType<typeof triggerAutomationRevisionRun>
}

export const manuallyTriggerAutomation =
  (deps: ManuallyTriggerAutomationDeps) =>
  async (params: {
    automationId: string
    userId: string
    projectId?: string
    userResourceAccessRules?: ContextResourceAccessRules
  }) => {
    const { automationId, userId, projectId, userResourceAccessRules } = params
    const {
      getAutomationTriggerDefinitions,
      getAutomation,
      getBranchLatestCommits,
      triggerFunction
    } = deps

    const [automation, triggerDefs] = await Promise.all([
      getAutomation({ automationId, projectId }),
      getAutomationTriggerDefinitions({
        automationId,
        projectId,
        triggerType: VersionCreationTriggerType
      })
    ])
    if (!automation) {
      throw new TriggerAutomationError('Automation not found')
    }
    if (!triggerDefs.length) {
      throw new TriggerAutomationError(
        'No model version creation triggers found for the automation'
      )
    }

    await validateStreamAccess(
      userId,
      automation.projectId,
      Roles.Stream.Owner,
      userResourceAccessRules
    )

    const validModelIds = triggerDefs.map((t) => t.triggeringId)
    const [latestCommit] = await getBranchLatestCommits(
      validModelIds,
      automation.projectId,
      { limit: 1 }
    )
    if (!latestCommit) {
      throw new TriggerAutomationError(
        'No version to trigger on found for the available triggers'
      )
    }

    // Trigger "model version created"
    return await triggerFunction({
      revisionId: triggerDefs[0].automationRevisionId,
      manifest: <VersionCreatedTriggerManifest>{
        projectId,
        modelId: latestCommit.branchId,
        versionId: latestCommit.id,
        triggerType: VersionCreationTriggerType
      }
    })
  }
