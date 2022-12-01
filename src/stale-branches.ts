import * as core from '@actions/core'
import {getBranches} from './functions/get-branches'
import {getRateLimit} from './functions/get-rate-limit'
import {getRecentCommitAge} from './functions/get-commit-age'
import {getRecentCommitLogin} from './functions/get-committer-login'
import {logBranchGroupColor} from './functions/logging/log-branch-group-color'
import {logLastCommitColor} from './functions/logging/log-last-commit-color'
import {logRateLimitBreak} from './functions/logging/log-rate-limit-break'
import {validateInputs} from './functions/get-context'
import {StaleBranch} from './types/stale-branch'

export async function run(): Promise<void> {
  //Declare output arrays
  const outputStales: StaleBranch[] = []

  try {
    //Validate & Return input values
    const validInputs = await validateInputs()
    if (validInputs.daysBeforeStale == null) {
      throw new Error('Invalid inputs')
    }
    //Collect Branches, Issue Budget, Existing Issues, & initialize lastCommitLogin
    const branches = await getBranches()
    let lastCommitLogin = 'Unknown'

    // Assess Branches
    for (const branchToCheck of branches) {
      // Break if Rate Limit usage exceeds 95%
      const rateLimit = await getRateLimit()
      if (rateLimit.used > 95) {
        core.info(logRateLimitBreak(rateLimit))
        core.setFailed('Exiting to avoid rate limit violation.')
        break
      }

      //Get age of last commit, generate issue title, and filter existing issues to current branch
      const commitAge = await getRecentCommitAge(branchToCheck.commmitSha)

      // Skip looking for last commit's login if input is set to false
      if (validInputs.tagLastCommitter === true) {
        lastCommitLogin = await getRecentCommitLogin(branchToCheck.commmitSha)
      }

      // Start output group for current branch assessment
      core.startGroup(logBranchGroupColor(branchToCheck.branchName, commitAge, validInputs.daysBeforeStale, validInputs.daysBeforeDelete))

      //Log last commit age
      core.info(logLastCommitColor(commitAge, validInputs.daysBeforeStale, validInputs.daysBeforeDelete))

      //Add the branch to the output list if the age is older than given criteria
      if (commitAge > validInputs.daysBeforeStale) {
        if (!outputStales.map(staleBranch => staleBranch.name).includes(branchToCheck.branchName)) {
          outputStales.push({name: branchToCheck.branchName, lastCommitAge: commitAge, lastCommitAuthor: lastCommitLogin})
        }
      }

      // Close output group for current branch assessment
      core.endGroup()
    }

    core.setOutput('stale-branches', JSON.stringify(outputStales))
  } catch (error) {
    if (error instanceof Error) core.setFailed(`Action failed. Error: ${error.message}`)
  }
}
