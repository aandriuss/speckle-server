import { getStreamRoute } from '@/modules/core/helpers/routeHelper'
import {
  InviteFinalizedForNewEmail,
  InviteFinalizingError,
  InviteNotFoundError
} from '@/modules/serverinvites/errors'
import {
  buildUserTarget,
  isProjectResourceTarget,
  resolveTarget
} from '@/modules/serverinvites/helpers/core'

import { getFrontendOrigin, useNewFrontend } from '@/modules/shared/helpers/envHelper'
import {
  InviteResourceTargetType,
  ServerInviteRecord
} from '@/modules/serverinvites/domain/types'
import {
  DeleteInvite,
  DeleteInvitesByTarget,
  DeleteServerOnlyInvites,
  FindInvite,
  FindServerInvite,
  InsertInviteAndDeleteOld,
  UpdateAllInviteTargets
} from '@/modules/serverinvites/domain/operations'
import {
  FinalizeInvite,
  InviteFinalizationAction,
  ProcessFinalizedResourceInvite,
  ValidateResourceInviteBeforeFinalization
} from '@/modules/serverinvites/services/operations'
import { ensureError, MaybeNullOrUndefined } from '@speckle/shared'
import { noop } from 'lodash'
import { ServerInvitesEvents } from '@/modules/serverinvites/domain/events'
import { TokenResourceIdentifier } from '@/modules/core/domain/tokens/types'
import { EventBusEmit } from '@/modules/shared/services/eventBus'
import {
  FindEmail,
  ValidateAndCreateUserEmail
} from '@/modules/core/domain/userEmails/operations'

/**
 * Resolve the relative auth redirect path, after registering with an invite
 * Note: Important auth query string params like the access_code are added separately
 * in auth middlewares
 */
export const resolveAuthRedirectPathFactory = () => (invite?: ServerInviteRecord) => {
  if (useNewFrontend()) {
    // All post-auth redirects are handled by the frontend itself
    return getFrontendOrigin()
  }

  /**
   * @deprecated Deprecated user flow, only relevant in FE1. Thus no need to update it w/ support for workspaces
   * and other new features.
   */
  if (invite) {
    const primaryTarget = invite.resource
    if (isProjectResourceTarget(primaryTarget)) {
      return `${getStreamRoute(primaryTarget.resourceId)}`
    }
  }

  // Fall-back to base URL (for server invites)
  return getFrontendOrigin()
}

/**
 * Validate that the new user has a valid invite for registering to the server
 */
export const validateServerInviteFactory =
  ({ findServerInvite }: { findServerInvite: FindServerInvite }) =>
  async (email?: string, token?: string): Promise<ServerInviteRecord> => {
    const invite = await findServerInvite(email, token)
    if (!invite) {
      throw new InviteNotFoundError(
        token
          ? "Wrong e-mail address or invite token. Make sure you're using the same e-mail address that received the invite."
          : "Wrong e-mail address. Make sure you're using the same e-mail address that received the invite.",
        {
          info: {
            email,
            token
          }
        }
      )
    }

    return invite
  }

/**
 * Finalize server registration by deleting unnecessary invites and updating
 * the remaining ones
 */
export const finalizeInvitedServerRegistrationFactory =
  ({
    deleteServerOnlyInvites,
    updateAllInviteTargets
  }: {
    deleteServerOnlyInvites: DeleteServerOnlyInvites
    updateAllInviteTargets: UpdateAllInviteTargets
  }) =>
  async (email: string, userId: string) => {
    // Delete all server-only invites for this email
    await deleteServerOnlyInvites(email)

    // Update all remaining invites to use a userId target, not the e-mail
    // (in case the user changes his e-mail right after)
    await updateAllInviteTargets(email, buildUserTarget(userId)!)
  }

type FinalizeResourceInviteFactoryDeps = {
  findInvite: FindInvite
  validateInvite: ValidateResourceInviteBeforeFinalization
  processInvite: ProcessFinalizedResourceInvite
  deleteInvitesByTarget: DeleteInvitesByTarget
  insertInviteAndDeleteOld: InsertInviteAndDeleteOld
  emitEvent: EventBusEmit
  findEmail: FindEmail
  validateAndCreateUserEmail: ValidateAndCreateUserEmail
}

export const finalizeResourceInviteFactory =
  (deps: FinalizeResourceInviteFactoryDeps): FinalizeInvite =>
  async (params) => {
    const {
      findInvite,
      validateInvite,
      processInvite,
      deleteInvitesByTarget,
      insertInviteAndDeleteOld,
      emitEvent,
      findEmail,
      validateAndCreateUserEmail
    } = deps
    const {
      finalizerUserId,
      accept,
      token,
      resourceType,
      finalizerResourceAccessLimits,
      allowAttachingNewEmail
    } = params

    const finalizerUserTarget = buildUserTarget(finalizerUserId)
    const invite = await findInvite({
      token,
      // target: allowAttachingNewEmail ? undefined : finalizerUserTarget,
      resourceFilter: resourceType ? { resourceType } : undefined
    })
    if (!invite) {
      throw new InviteNotFoundError('Attempted to finalize nonexistant invite', {
        info: params
      })
    }

    const inviteTarget = resolveTarget(invite.target)
    let isNewEmailTarget = !!inviteTarget.userEmail?.length
    if (isNewEmailTarget && allowAttachingNewEmail) {
      const existingEmail = await findEmail({ email: inviteTarget.userEmail! })
      if (existingEmail) {
        // This shouldn't really happen, but just in case
        isNewEmailTarget = false
      }
    }

    if (isNewEmailTarget) {
      if (!allowAttachingNewEmail) {
        throw new InviteFinalizedForNewEmail(
          InviteFinalizedForNewEmail.defaultMessage,
          {
            info: {
              finalizerUserId,
              invite
            }
          }
        )
      }
    } else {
      if (invite.target !== finalizerUserTarget) {
        throw new InviteFinalizingError('Attempted to finalize mismatched invite', {
          info: {
            finalizerUserId,
            invite
          }
        })
      }
    }

    const action = accept
      ? InviteFinalizationAction.ACCEPT
      : InviteFinalizationAction.DECLINE

    await validateInvite({
      invite,
      finalizerUserId,
      action,
      finalizerResourceAccessLimits
    })

    // Delete invites first, so that any subscriptions fired by processInvite
    // don't return the invite back to the frontend
    await deleteInvitesByTarget(
      invite.target,
      invite.resource.resourceType,
      invite.resource.resourceId
    )

    try {
      // Add email
      if (isNewEmailTarget) {
        await validateAndCreateUserEmail({
          userEmail: {
            email: inviteTarget.userEmail!,
            userId: finalizerUserId,
            verified: true
          }
        })
      }

      // Process invite
      await processInvite({
        invite,
        finalizerUserId,
        action
      })
    } catch (e) {
      // If the invite finalization fails, re-insert the invite
      await insertInviteAndDeleteOld(invite).catch(noop)

      throw new InviteFinalizingError('Failed to process invite', {
        cause: ensureError(e),
        info: {
          finalizerUserId,
          accept,
          invite
        }
      })
    }

    await emitEvent({
      eventName: ServerInvitesEvents.Finalized,
      payload: {
        invite,
        accept,
        finalizerUserId
      }
    })
  }

export const cancelResourceInviteFactory =
  (deps: {
    findInvite: FindInvite
    validateResourceAccess: ValidateResourceInviteBeforeFinalization
    deleteInvite: DeleteInvite
  }) =>
  async (params: {
    inviteId: string
    resourceId: string
    resourceType: InviteResourceTargetType
    cancelerId: string
    cancelerResourceAccessLimits: MaybeNullOrUndefined<TokenResourceIdentifier[]>
  }) => {
    const { findInvite, validateResourceAccess, deleteInvite } = deps
    const {
      inviteId,
      resourceId,
      resourceType,
      cancelerId,
      cancelerResourceAccessLimits
    } = params

    const invite = await findInvite({
      inviteId,
      resourceFilter: {
        resourceId,
        resourceType
      }
    })
    if (!invite) {
      throw new InviteNotFoundError('Attempted to cancel nonexistant invite', {
        info: {
          ...params
        }
      })
    }

    await validateResourceAccess({
      invite,
      finalizerUserId: cancelerId,
      action: InviteFinalizationAction.CANCEL,
      finalizerResourceAccessLimits: cancelerResourceAccessLimits
    })
    await deleteInvite(invite.id)
  }

/**
 * Delete pending invite - does no access checks!
 */
export const deleteInviteFactory =
  ({
    findInvite,
    deleteInvite
  }: {
    findInvite: FindInvite
    deleteInvite: DeleteInvite
  }) =>
  async (inviteId: string) => {
    const invite = await findInvite({ inviteId })
    if (!invite) {
      throw new InviteNotFoundError('Attempted to delete a nonexistant invite')
    }

    await deleteInvite(invite.id)
  }
