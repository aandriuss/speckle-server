import type { MaybeNullOrUndefined } from '@speckle/shared'
import type { PropAnyComponent } from '@speckle/ui-components'
import { graphql } from '~/lib/common/generated/gql'
import {
  AutomateRunStatus,
  type TriggeredAutomationsStatusSummaryFragment
} from '~/lib/common/generated/gql/graphql'
import {
  CheckCircleIcon,
  CheckIcon,
  XCircleIcon,
  XMarkIcon,
  EllipsisHorizontalCircleIcon,
  EllipsisHorizontalIcon,
  ArrowRightCircleIcon,
  ArrowRightIcon
} from '@heroicons/vue/24/solid'

// TODO: Clean up lib - multiple automate folders

graphql(`
  fragment TriggeredAutomationsStatusSummary on TriggeredAutomationsStatus {
    id
    automationRuns {
      id
      functionRuns {
        id
        status
      }
    }
  }
`)

export type RunsStatusSummary = {
  failed: number
  passed: number
  inProgress: number
  total: number
  title: string
  titleColor: string
  longSummary: string
}

export const useRunsSummary = (params: {
  status: MaybeRef<MaybeNullOrUndefined<TriggeredAutomationsStatusSummaryFragment>>
}) => {
  const { status } = params

  const allFunctionRuns = computed(() => {
    const currentStatus = unref(status)
    if (!currentStatus) return []

    return currentStatus.automationRuns.flatMap((run) => run.functionRuns)
  })

  const summary = computed((): MaybeNullOrUndefined<RunsStatusSummary> => {
    const currentStatus = unref(status)
    if (!currentStatus) return currentStatus
    if (!allFunctionRuns.value.length) return null

    const result: RunsStatusSummary = {
      failed: 0,
      passed: 0,
      inProgress: 0,
      total: allFunctionRuns.value.length,
      title: 'All runs passed.',
      titleColor: 'text-success',
      longSummary: ''
    }

    for (const run of allFunctionRuns.value) {
      switch (run.status) {
        case AutomateRunStatus.Succeeded:
          result.passed++
          break
        case AutomateRunStatus.Failed:
          result.title = 'Some runs failed.'
          result.titleColor = 'text-danger'
          result.failed++
          break
        default:
          if (result.failed === 0) {
            result.title = 'Some runs are still in progress.'
            result.titleColor = 'text-warning'
          }
          result.inProgress++
          break
      }
    }

    // format:
    // 2 failed, 1 passed runs
    // 1 passed, 2 in progress, 1 failed runs
    // 1 passed run
    const longSummarySegments = []
    if (result.passed > 0) longSummarySegments.push(`${result.passed} passed`)
    if (result.inProgress > 0)
      longSummarySegments.push(`${result.inProgress} in progress`)
    if (result.failed > 0) longSummarySegments.push(`${result.failed} failed`)

    result.longSummary = (
      longSummarySegments.join(', ') + ` run${result.total > 1 ? 's' : ''}.`
    ).replace(/,(?=[^,]+$)/, ', and')

    return result
  })

  return { summary }
}

export type AutomateRunStatusMetadata = {
  icon: PropAnyComponent
  xsIcon: PropAnyComponent
  iconColor: string
  badgeColor: string
  disclosureColor: 'success' | 'warning' | 'danger' | 'default'
}

export const useRunStatusMetadata = (params: {
  status: MaybeRef<AutomateRunStatus>
}) => {
  const { status } = params

  const metadata = computed((): AutomateRunStatusMetadata => {
    switch (unref(status)) {
      case AutomateRunStatus.Succeeded:
        return {
          icon: CheckCircleIcon,
          xsIcon: CheckIcon,
          iconColor: 'text-success',
          badgeColor: 'bg-success',
          disclosureColor: 'success'
        }
      case AutomateRunStatus.Failed:
        return {
          icon: XCircleIcon,
          xsIcon: XMarkIcon,
          iconColor: 'text-danger',
          badgeColor: 'bg-danger',
          disclosureColor: 'danger'
        }
      case AutomateRunStatus.Running:
        return {
          icon: ArrowRightCircleIcon,
          xsIcon: ArrowRightIcon,
          iconColor: 'text-warning animate-pulse',
          badgeColor: 'bg-warning',
          disclosureColor: 'default'
        }
      case AutomateRunStatus.Initializing:
        return {
          icon: EllipsisHorizontalCircleIcon,
          xsIcon: EllipsisHorizontalIcon,
          iconColor: 'text-warning animate-pulse',
          badgeColor: 'bg-warning',
          disclosureColor: 'warning'
        }
    }
  })

  return { metadata }
}
