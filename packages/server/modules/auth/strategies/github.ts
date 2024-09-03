/* istanbul ignore file */

import passport from 'passport'
import type { VerifyCallback } from 'passport-oauth2'
import { Strategy as GithubStrategy, type Profile } from 'passport-github2'
import { findOrCreateUser, getUserByEmail } from '@/modules/core/services/users'
import { getServerInfo } from '@/modules/core/services/generic'
import {
  validateServerInviteFactory,
  finalizeInvitedServerRegistrationFactory,
  resolveAuthRedirectPathFactory
} from '@/modules/serverinvites/services/processing'
import { passportAuthenticate } from '@/modules/auth/services/passportService'
import {
  UserInputError,
  UnverifiedEmailSSOLoginError
} from '@/modules/core/errors/userinput'
import db from '@/db/knex'
import {
  deleteServerOnlyInvitesFactory,
  updateAllInviteTargetsFactory,
  findServerInviteFactory
} from '@/modules/serverinvites/repositories/serverInvites'
import { ServerInviteResourceType } from '@/modules/serverinvites/domain/constants'
import { getResourceTypeRole } from '@/modules/serverinvites/helpers/core'
import { AuthStrategyBuilder, AuthStrategyMetadata } from '@/modules/auth/helpers/types'
import {
  getGithubClientId,
  getGithubClientSecret,
  getServerOrigin
} from '@/modules/shared/helpers/envHelper'
import type { Request } from 'express'
import { get } from 'lodash'
import { ensureError, Optional } from '@speckle/shared'
import { ServerInviteRecord } from '@/modules/serverinvites/domain/types'
import { EnvironmentResourceError } from '@/modules/shared/errors'

const githubStrategyBuilder: AuthStrategyBuilder = async (
  app,
  sessionMiddleware,
  moveAuthParamsToSessionMiddleware,
  finalizeAuthMiddleware
) => {
  const strategy: AuthStrategyMetadata & { callbackUrl: string } = {
    id: 'github',
    name: 'Github',
    icon: 'mdi-github',
    color: 'grey darken-3',
    url: '/auth/gh',
    callbackUrl: '/auth/gh/callback'
  }

  const myStrategy = new GithubStrategy(
    {
      clientID: getGithubClientId(),
      clientSecret: getGithubClientSecret(),
      callbackURL: new URL(strategy.callbackUrl, getServerOrigin()).toString(),
      // WARNING, the 'user:email' scope belongs to the GITHUB scopes
      // DO NOT change it to our internal scope definitions !!!
      // You have been warned.
      scope: ['profile', 'user:email'],
      passReqToCallback: true
    },
    // I've no idea why, but TS refuses to type these params
    async (
      req: Request,
      _accessToken: string,
      _refreshToken: string,
      profile: Profile,
      done: VerifyCallback
    ) => {
      const serverInfo = await getServerInfo()
      const logger = req.log.child({
        authStrategy: 'github',
        profileId: profile.id,
        serverVersion: serverInfo.version
      })

      try {
        const email = profile.emails?.[0].value
        if (!email) {
          throw new EnvironmentResourceError('No email provided by Github')
        }

        const name = profile.displayName || profile.username
        const bio = get(profile, '_json.bio') || undefined

        const user = { email, name, bio }

        const existingUser = await getUserByEmail({ email: user.email })

        if (existingUser && !existingUser.verified) {
          throw new UnverifiedEmailSSOLoginError(undefined, {
            info: {
              email: user.email
            }
          })
        }

        // if there is an existing user, go ahead and log them in (regardless of
        // whether the server is invite only or not).
        if (existingUser) {
          const myUser = await findOrCreateUser({ user })
          return done(null, myUser)
        }

        // if the server is invite only and we have no invite id, throw.
        if (serverInfo.inviteOnly && !req.session.token) {
          throw new UserInputError(
            'This server is invite only. Please authenticate yourself through a valid invite link.'
          )
        }

        // validate the invite, if any
        let invite: Optional<ServerInviteRecord> = undefined
        if (req.session.token) {
          invite = await validateServerInviteFactory({
            findServerInvite: findServerInviteFactory({ db })
          })(user.email, req.session.token)
        }

        // create the user
        const myUser = await findOrCreateUser({
          user: {
            ...user,
            role: invite
              ? getResourceTypeRole(invite.resource, ServerInviteResourceType)
              : undefined,
            verified: !!invite
          }
        })

        // use the invite
        await finalizeInvitedServerRegistrationFactory({
          deleteServerOnlyInvites: deleteServerOnlyInvitesFactory({ db }),
          updateAllInviteTargets: updateAllInviteTargetsFactory({ db })
        })(user.email, myUser.id)

        // Resolve redirect path
        req.authRedirectPath = resolveAuthRedirectPathFactory()(invite)

        // return to the auth flow
        return done(null, {
          ...myUser,
          isInvite: !!invite
        })
      } catch (err) {
        const e = ensureError(
          err,
          'Unexpected issue occured while authenticating with GitHub'
        )
        switch (e.constructor) {
          case UserInputError:
            logger.info(err)
            break
          default:
            logger.error(err)
        }
        return done(err, false, { message: e.message })
      }
    }
  )

  passport.use(myStrategy)

  // 1. Auth init
  app.get(
    strategy.url,
    sessionMiddleware,
    moveAuthParamsToSessionMiddleware,
    passportAuthenticate('github')
  )

  // 2. Auth finish
  app.get(
    strategy.callbackUrl,
    sessionMiddleware,
    passportAuthenticate('github'),
    finalizeAuthMiddleware
  )

  return strategy
}

export = githubStrategyBuilder
