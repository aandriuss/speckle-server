import { type Optional } from '@speckle/shared'
import { omit } from 'lodash-es'
import { activeUserQuery } from '~/lib/auth/composables/activeUser'
import { useApolloClientFromNuxt } from '~/lib/common/composables/graphql'
import { graphql } from '~/lib/common/generated/gql'
import type { UseWorkspaceInviteManager_PendingWorkspaceCollaboratorFragment } from '~/lib/common/generated/gql/graphql'
import { useProjectInviteManager } from '~/lib/projects/composables/invites'
import { useWorkspaceInviteManager } from '~/lib/workspaces/composables/management'
import { workspaceAccessCheckQuery } from '~/lib/workspaces/graphql/queries'

const autoAcceptableWorkspaceInviteQuery = graphql(`
  query AutoAcceptableWorkspaceInvite($token: String!, $workspaceId: String!) {
    workspaceInvite(token: $token, workspaceId: $workspaceId) {
      id
      ...UseWorkspaceInviteManager_PendingWorkspaceCollaborator
    }
  }
`)

/**
 * Handles all of the invite auto-accepting logic (when clicking on email accept links)
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const isWorkspacesEnabled = useIsWorkspacesEnabled()

  const shouldTryProjectAccept = to.path.startsWith('/projects/')
  const shouldTryWorkspaceAccept =
    to.path.startsWith('/workspaces/') && isWorkspacesEnabled.value
  const idParam = to.params.id as Optional<string>
  const token = to.query.token as Optional<string>
  const accept = to.query.accept === 'true'
  const addNewEmail = to.query.addNewEmail === 'true'
  let hasWorkspaceAccess = false

  if (!idParam?.length) return
  if (!shouldTryProjectAccept && !shouldTryWorkspaceAccept) return
  if (!token?.length || !accept) return

  const { useInvite } = useProjectInviteManager()
  const client = useApolloClientFromNuxt()

  const workspaceInvite =
    ref<UseWorkspaceInviteManager_PendingWorkspaceCollaboratorFragment>()
  const { accept: acceptWorkspaceInvite } = useWorkspaceInviteManager(
    {
      invite: workspaceInvite
    },
    {
      route: to,
      preventRedirect: true,
      preventErrorToasts: (errors) => {
        // Don't show if INVITE_FINALIZED_FOR_NEW_EMAIL and doesn't have any workspace access yet,
        // cause we expect the user to manually press the "Add email" button in that scenario
        const isNewEmailError = errors.some(
          (e) => e.extensions?.code === 'INVITE_FINALIZED_FOR_NEW_EMAIL'
        )
        if (isNewEmailError && !hasWorkspaceAccess) return true

        return false
      }
    }
  )

  const [activeUserData, workspaceInviteData, workspaceAccessData] = await Promise.all([
    client
      .query({
        query: activeUserQuery
      })
      .catch(convertThrowIntoFetchResult),
    ...(shouldTryWorkspaceAccept
      ? <const>[
          client
            .query({
              query: autoAcceptableWorkspaceInviteQuery,
              variables: {
                token,
                workspaceId: idParam
              }
            })
            .catch(convertThrowIntoFetchResult),
          client
            .query({
              query: workspaceAccessCheckQuery,
              variables: {
                id: idParam
              }
            })
            .catch(convertThrowIntoFetchResult)
        ]
      : [])
  ])

  if (workspaceInviteData?.data?.workspaceInvite) {
    workspaceInvite.value = workspaceInviteData.data.workspaceInvite
  }
  if (workspaceAccessData?.data?.workspace.id) {
    hasWorkspaceAccess = true
  }

  // Ignore if not logged in
  if (!activeUserData.data?.activeUser?.id) return

  let success = false
  if (shouldTryProjectAccept) {
    success = await useInvite({ token, accept, projectId: idParam })
  } else if (shouldTryWorkspaceAccept) {
    success = await acceptWorkspaceInvite({ addNewEmail })
  }

  if (success) {
    return navigateTo(
      {
        query: omit(to.query, ['token', 'accept', 'addNewEmail'])
      },
      { replace: true }
    )
  }
})
