export type GithubWorkflowParams = {
  repoName: string
  owner: string
  branch: string
  environment: string
  workflowId: string
  appType: string
}

export type GithubWorkflowSettings = Record<
  /**
   * repoName key
   */
  string,
  Record<
    /**
     * environment key
     */
    string,
    GithubWorkflowParams
  >
>
